import { acoustIDLookup, AcoustIDResult, getAcoustidFingerprint } from "./acoustid";
import { withRetry, isRetryableHttpError } from "../../utils/retry";

const BASE_URL = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Beetroot/0.1.0 (https://github.com/yourusername/beetroot)';

// Rate limiting: MusicBrainz allows 1 request per second per IP on average
// Per their docs: https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
// Using 1.5s to be more conservative and avoid rate limit errors
const MIN_REQUEST_INTERVAL = 1500; // 1.5 seconds - more conservative than the required 1s

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Promise chain for rate limiting - ensures sequential execution
let rateLimitChain: Promise<void> = Promise.resolve();

async function rateLimitedFetch(url: string, options?: RequestInit): Promise<Response> {
    // Chain this request after the previous one
    const mySlot = rateLimitChain.then(async () => {
        await sleep(MIN_REQUEST_INTERVAL);
    });

    // Update chain for next request
    rateLimitChain = mySlot;

    // Wait for our slot, then execute
    await mySlot;
    return fetch(url, options);
}

export interface MusicBrainzArtist {
    id: string;
    name: string;
    'sort-name': string;
}

export interface MusicBrainzReleaseGroup {
    id: string;
    title: string;
    'primary-type'?: string;
    'secondary-types'?: string[];
    'first-release-date'?: string;
    'artist-credit'?: Array<{
        artist: {
            id: string;
            name: string;
        };
        joinphrase?: string;
    }>;
}

export interface MusicBrainzRelease {
    id: string;
    title: string;
    date?: string;
    country?: string;
    status?: string;
    barcode?: string;
    'release-group'?: MusicBrainzReleaseGroup;
    'artist-credit'?: Array<{
        artist: { id: string; name: string };
        joinphrase?: string;
    }>;
    media?: Array<{
        position: number;
        'track-count': number;
        tracks?: Array<{
            id: string;
            number: string;
            position: number;
            title: string;
            recording?: { id: string };
        }>;
    }>;
    'label-info'?: Array<{
        'catalog-number'?: string;
        label?: { id: string; name: string };
    }>;
}

export interface MusicBrainzRecording {
    id: string;
    title: string;
    length?: number;
    disambiguation?: string;
    isrcs?: string[];
    'artist-credit': Array<{
        artist: MusicBrainzArtist;
        joinphrase?: string;
    }>;
    releases: MusicBrainzRelease[];
}

export interface Recording {
    musicbrainzId: string;
    acoustIdId: string;
    acoustIdScore: number;
    title: string;
    duration?: number;
    disambiguation?: string;
    artists: string[];
    artistIds: string[];
    albumArtist?: string;
    albumArtistIds?: string[];
    releaseId?: string;
    releaseTitle?: string;
    releaseDate?: string;
    releaseCountry?: string;
    releaseStatus?: string;
    releaseGroupId?: string;
    releaseTrackId?: string;
    trackNumber?: number;
    trackTotal?: number;
    discNumber?: number;
    discTotal?: number;
    isrc?: string;
    barcode?: string;
    asin?: string;
    catalogNumber?: string;
    label?: string;
    filePath: string;
}

async function fetchMusicBrainz(recordingId: string): Promise<MusicBrainzRecording> {
    return withRetry(async () => {
        // Fetch recording data with minimal release info for picking best release
        const response = await rateLimitedFetch(
            `${BASE_URL}/recording/${recordingId}?inc=artists+releases+release-groups+isrcs&fmt=json`,
            { headers: { 'User-Agent': USER_AGENT } }
        );

        // 404 means recording doesn't exist - don't retry
        if (response.status === 404) {
            throw new Error(`MusicBrainz recording ${recordingId} not found (404)`);
        }

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`MusicBrainz API error ${response.status}: ${body}`);
        }

        return response.json();
    }, {
        maxRetries: 10,
        baseDelay: 1000,
        maxDelay: 120000,
        shouldRetry: isRetryableHttpError,
        onRetry: (error, attempt) => {
            console.debug(`MusicBrainz error, retrying (attempt ${attempt}/10): ${error.message}`);
        },
    });
}

// In-flight cache so concurrent per-track resolves in the same cluster
// dedupe to a single network request. Cleared when the promise settles.
const releaseDetailsInFlight = new Map<string, Promise<MusicBrainzRelease | undefined>>();

async function fetchReleaseDetails(releaseId: string): Promise<MusicBrainzRelease | undefined> {
    const cached = releaseDetailsInFlight.get(releaseId);
    if (cached) return cached;

    const promise = withRetry(async () => {
        // Fetch complete release data including media, tracks, labels, etc.
        const response = await rateLimitedFetch(
            `${BASE_URL}/release/${releaseId}?inc=artist-credits+recordings+release-groups+labels+media&fmt=json`,
            { headers: { 'User-Agent': USER_AGENT } }
        );

        // 404 or other client errors - don't retry, just return undefined
        if (!response.ok) return undefined;

        return await response.json() as MusicBrainzRelease;
    }, {
        maxRetries: 10,
        baseDelay: 1000,
        maxDelay: 120000,
        shouldRetry: isRetryableHttpError,
        onRetry: (error, attempt) => {
            console.debug(`MusicBrainz error fetching release, retrying (attempt ${attempt}/10): ${error.message}`);
        },
    }).catch((error) => {
        console.debug(`Failed to fetch release details for ${releaseId}: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }).finally(() => {
        releaseDetailsInFlight.delete(releaseId);
    });

    releaseDetailsInFlight.set(releaseId, promise);
    return promise;
}

async function pickBestRelease(releases: MusicBrainzRelease[], artistId: string): Promise<MusicBrainzRelease | undefined> {
    if (!releases?.length) return undefined;

    // Filter by artist if artistId is provided and available
    let filtered = releases;
    if (artistId) {
        const matchingArtist = releases.filter(r =>
            r['artist-credit']?.some(c => c.artist.id === artistId)
        );
        if (matchingArtist.length > 0) {
            filtered = matchingArtist;
        }
    }

    const pool = filtered.filter(r => r.status === 'Official');
    const candidates = pool.length ? pool : filtered;

    // Prefer country-specific releases over worldwide
    // US first (most common in MusicBrainz), then other major markets, then worldwide
    const preference = ['US', 'GB', 'CA', 'AU', 'JP', 'DE', 'XW'];

    return candidates.sort((a, b) => {
        const rgDateA = a['release-group']?.['first-release-date'] ?? '9999';
        const rgDateB = b['release-group']?.['first-release-date'] ?? '9999';
        if (rgDateA !== rgDateB) return rgDateA < rgDateB ? -1 : 1;

        const rankA = preference.indexOf(a.country ?? '');
        const rankB = preference.indexOf(b.country ?? '');
        return (rankA === -1 ? preference.length : rankA) - (rankB === -1 ? preference.length : rankB);
    })[0];
}

async function toRecording(
    mb: MusicBrainzRecording,
    acoustIdResult: AcoustIDResult,
    filePath: string
): Promise<Recording> {
    const artistId = mb['artist-credit'][0]?.artist.id;
    const primaryRelease = await pickBestRelease(mb.releases, artistId);

    // Fetch complete release details in one call
    let releaseDetails: MusicBrainzRelease | undefined;
    let trackInfo: { trackId?: string; trackNumber?: number; trackTotal?: number; discNumber?: number; discTotal?: number } = {};

    if (primaryRelease?.id) {
        releaseDetails = await fetchReleaseDetails(primaryRelease.id);

        // Extract track/disc info from complete release data
        if (releaseDetails?.media) {
            for (const medium of releaseDetails.media) {
                const track = medium.tracks?.find(t => t.recording?.id === mb.id);
                if (track) {
                    trackInfo = {
                        trackId: track.id,
                        trackNumber: track.position,
                        trackTotal: medium['track-count'],
                        discNumber: medium.position,
                        discTotal: releaseDetails.media.length,
                    };
                    break;
                }
            }
        }
    }

    // Get album artist from release details (has complete artist-credits)
    const albumArtistCredit = releaseDetails?.['artist-credit'];
    const albumArtist = albumArtistCredit?.[0]?.artist.name;
    const albumArtistIds = albumArtistCredit?.map(a => a.artist.id);

    // Get ISRC (first one if multiple)
    const isrc = mb.isrcs?.[0];

    // Get barcode from release details
    const barcode = releaseDetails?.barcode;

    // Get label and catalog number from release details
    const labelInfo = releaseDetails?.['label-info']?.[0];
    const label = labelInfo?.label?.name;
    const catalogNumber = labelInfo?.['catalog-number'];

    // Skip ASIN fetch - it requires an extra API call and is rarely used
    // Users can add it from file tags if needed
    const asin = undefined;

    return {
        musicbrainzId: mb.id,
        acoustIdId: acoustIdResult.id,
        acoustIdScore: acoustIdResult.score,
        title: mb.title,
        duration: mb.length,
        disambiguation: mb.disambiguation,
        artists: mb['artist-credit'].map(a => a.artist.name),
        artistIds: mb['artist-credit'].map(a => a.artist.id),
        albumArtist,
        albumArtistIds,
        releaseId: primaryRelease?.id,
        releaseTitle: primaryRelease?.title,
        releaseDate: primaryRelease?.date,
        releaseCountry: primaryRelease?.country,
        releaseStatus: primaryRelease?.status,
        releaseGroupId: primaryRelease?.['release-group']?.id,
        releaseTrackId: trackInfo.trackId,
        trackNumber: trackInfo.trackNumber,
        trackTotal: trackInfo.trackTotal,
        discNumber: trackInfo.discNumber,
        discTotal: trackInfo.discTotal,
        isrc,
        barcode,
        asin,
        catalogNumber,
        label,
        filePath,
    };
}

export async function getMusicBrainzData(
    acoustIdResults: AcoustIDResult[],
    filePath: string
): Promise<Recording | null> {
    if (acoustIdResults.length === 0) {
        return null;
    }

    for (const result of acoustIdResults) {
        if (!result.recordings?.length) continue;

        const recordingId = result.recordings[0].id;
        try {
            const mb = await fetchMusicBrainz(recordingId);
            return await toRecording(mb, result, filePath);
        } catch (error) {
            console.debug(`Failed to fetch recording ${recordingId}, trying next...`);
        }
    }

    return null;
}

// Escape Lucene-style special characters for MusicBrainz text search queries
function escapeLucene(s: string): string {
    return s.replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, '\\$&');
}

// Text-search fallback for when fpcalc fails (e.g. m4a) or AcoustID returns no
// results. Queries MusicBrainz directly by (artist, title, optional release).
// Returns the best matching recording ID or null.
export async function searchMusicBrainzByText(
    artist: string,
    title: string,
    album?: string | null
): Promise<string | null> {
    const parts: string[] = [];
    if (artist) parts.push(`artist:"${escapeLucene(artist)}"`);
    if (title) parts.push(`recording:"${escapeLucene(title)}"`);
    if (album) parts.push(`release:"${escapeLucene(album)}"`);
    if (parts.length === 0) return null;

    const query = parts.join(' AND ');
    const url = `${BASE_URL}/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=5`;

    try {
        return await withRetry(async () => {
            const response = await rateLimitedFetch(url, { headers: { 'User-Agent': USER_AGENT } });
            if (!response.ok) {
                throw new Error(`MusicBrainz text search ${response.status}`);
            }
            const data = await response.json();
            const recordings = data?.recordings as Array<{ id: string; score?: number }> | undefined;
            if (!recordings?.length) return null;
            // MusicBrainz returns a `score` 0-100; demand a reasonable match
            const best = recordings[0];
            if ((best.score ?? 0) < 80) return null;
            return best.id;
        }, {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 30000,
            shouldRetry: isRetryableHttpError,
        });
    } catch {
        return null;
    }
}

import { DataSource } from '../../types';
import { Item } from '../../../database';
import { normalizeAlbumString } from '../../../database/normalize';

// === Cluster-level release lookup (Picard "Cluster → Lookup" flow) ===

export interface ClusterReleaseInput {
    albumartist: string | null;
    album: string | null;
    trackCount: number;
    releaseGroupId?: string | null;
}

export interface ClusterReleaseResult {
    mb_albumid: string;
    mb_releasegroupid: string | null;
    release: MusicBrainzRelease;
}

type ReleaseSearchHit = MusicBrainzRelease & {
    score?: number;
    'track-count'?: number;
};

function totalTrackCount(r: MusicBrainzRelease): number {
    if (!r.media?.length) return 0;
    return r.media.reduce((sum, m) => sum + (m['track-count'] ?? 0), 0);
}

async function searchReleasesByArtistAlbum(
    artist: string,
    album: string,
    limit = 25
): Promise<ReleaseSearchHit[]> {
    const parts: string[] = [];
    if (album) parts.push(`release:"${escapeLucene(album)}"`);
    if (artist) parts.push(`artistname:"${escapeLucene(artist)}"`);
    if (!parts.length) return [];

    const query = parts.join(' AND ');
    const url = `${BASE_URL}/release/?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}`;

    try {
        return await withRetry(async () => {
            const response = await rateLimitedFetch(url, { headers: { 'User-Agent': USER_AGENT } });
            if (!response.ok) throw new Error(`MusicBrainz release search ${response.status}`);
            const data = await response.json();
            return (data?.releases as ReleaseSearchHit[]) ?? [];
        }, {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 30000,
            shouldRetry: isRetryableHttpError,
        });
    } catch {
        return [];
    }
}

// Picard-style: given a whole cluster's worth of context, pick one MusicBrainz
// release that the cluster belongs to. Prefers releases whose track count
// matches the cluster size, which is what stops a stray single-track lookup
// from getting matched against a "single" release instead of the album.
export async function lookupReleaseForCluster(
    input: ClusterReleaseInput
): Promise<ClusterReleaseResult | null> {
    const artist = input.albumartist?.trim() ?? '';
    const album = input.album?.trim() ?? '';

    if (!album) return null;

    const hits = await searchReleasesByArtistAlbum(artist, album);
    if (!hits.length) return null;

    const targetCount = input.trackCount;
    const normAlbum = normalizeAlbumString(album);
    const normArtist = normalizeAlbumString(artist);

    let best: { hit: ReleaseSearchHit; score: number } | null = null;
    for (const hit of hits) {
        let score = hit.score ?? 0; // MB's own 0-100 match score

        const tc = totalTrackCount(hit) || hit['track-count'] || 0;
        if (tc > 0) {
            const diff = Math.abs(tc - targetCount);
            if (diff === 0) score += 40;
            else if (diff === 1) score += 20;
            else if (diff <= 2) score += 5;
            else score -= 20; // discourage releases with wildly different track counts
        }

        if (hit.status === 'Official') score += 15;

        if (normAlbum && normalizeAlbumString(hit.title) === normAlbum) score += 15;

        if (normArtist) {
            const hitArtist = hit['artist-credit']?.[0]?.artist.name;
            if (hitArtist && normalizeAlbumString(hitArtist) === normArtist) score += 15;
        }

        if (input.releaseGroupId && hit['release-group']?.id === input.releaseGroupId) {
            score += 25;
        }

        if (!best || score > best.score) best = { hit, score };
    }

    // Demand a meaningful match; otherwise the caller should fall back to
    // per-track lookup so we never regress on cluster-less imports.
    if (!best || best.score < 70) return null;

    const full = await fetchReleaseDetails(best.hit.id);
    if (!full) return null;

    return {
        mb_albumid: full.id,
        mb_releasegroupid: full['release-group']?.id ?? null,
        release: full,
    };
}

export interface MatchedReleaseTrack {
    trackId: string;
    recordingId: string;
    trackNumber: number;
    trackTotal: number;
    discNumber: number;
    discTotal: number;
    title: string;
}

// Map an item (from local tags) to a specific recording inside a release.
// Tries (disc, track) → track-only → fuzzy title.
export function matchTrackInRelease(
    release: MusicBrainzRelease,
    item: Pick<Item, 'track' | 'disc' | 'title'>
): MatchedReleaseTrack | null {
    if (!release.media?.length) return null;
    const discTotal = release.media.length;

    const buildMatch = (
        medium: NonNullable<MusicBrainzRelease['media']>[number],
        track: NonNullable<NonNullable<MusicBrainzRelease['media']>[number]['tracks']>[number]
    ): MatchedReleaseTrack | null => {
        if (!track.recording?.id) return null;
        return {
            trackId: track.id,
            recordingId: track.recording.id,
            trackNumber: track.position,
            trackTotal: medium['track-count'],
            discNumber: medium.position,
            discTotal,
            title: track.title,
        };
    };

    const trackNum = item.track ?? null;
    const discNum = item.disc ?? null;

    if (trackNum != null && discNum != null) {
        const medium = release.media.find(m => m.position === discNum);
        const track = medium?.tracks?.find(
            t => t.position === trackNum || Number(t.number) === trackNum
        );
        if (medium && track) return buildMatch(medium, track);
    }

    if (trackNum != null) {
        for (const medium of release.media) {
            const track = medium.tracks?.find(
                t => t.position === trackNum || Number(t.number) === trackNum
            );
            if (track) return buildMatch(medium, track);
        }
    }

    if (item.title) {
        const wanted = normalizeAlbumString(item.title);
        for (const medium of release.media) {
            const track = medium.tracks?.find(t => normalizeAlbumString(t.title) === wanted);
            if (track) return buildMatch(medium, track);
        }
    }

    return null;
}

// Enrich an item from a release we already chose at cluster level. Mirrors
// the field mapping done in MusicBrainzSource.getData but driven by a release
// instead of a recording, so every cluster track gets identical album-level
// fields and matches the same albums row in writeOrUpdateAlbum.
export function applyClusterReleaseToItem(
    item: Item,
    release: MusicBrainzRelease
): Item {
    const albumArtistCredit = release['artist-credit'];
    const albumArtist = albumArtistCredit?.[0]?.artist.name;
    const albumArtistIds = albumArtistCredit?.map(a => a.artist.id);

    const labelInfo = release['label-info']?.[0];
    const label = labelInfo?.label?.name;
    const catalogNumber = labelInfo?.['catalog-number'];

    const matched = matchTrackInRelease(release, item);

    return {
        ...item,
        mb_albumid: release.id || item.mb_albumid,
        mb_releasegroupid: release['release-group']?.id || item.mb_releasegroupid,
        mb_albumartistid: albumArtistIds?.[0] || item.mb_albumartistid,
        mb_albumartistids: albumArtistIds?.join(', ') || item.mb_albumartistids,
        mb_trackid: matched?.recordingId || item.mb_trackid,
        mb_releasetrackid: matched?.trackId || item.mb_releasetrackid,
        title: matched?.title || item.title,
        track: matched?.trackNumber ?? item.track,
        tracktotal: matched?.trackTotal ?? item.tracktotal,
        disc: matched?.discNumber ?? item.disc,
        disctotal: matched?.discTotal ?? item.disctotal,
        album: release.title || item.album,
        albumartist: albumArtist || item.albumartist,
        year: release.date ? new Date(release.date).getFullYear() : item.year,
        month: release.date ? new Date(release.date).getMonth() + 1 : item.month,
        day: release.date ? new Date(release.date).getDate() : item.day,
        country: release.country || item.country,
        albumstatus: release.status || item.albumstatus,
        barcode: release.barcode || item.barcode,
        catalognum: catalogNumber || item.catalognum,
        label: label || item.label,
    };
}

export class MusicBrainzSource extends DataSource {
    private readonly baseConfidence = 0.85;
    readonly confidence = 0.85;

    async getData(item: Item): Promise<Item> {
        try {
            // Album-anchored short-circuit: if the item already carries an
            // mb_albumid (from file tags or a cluster seed), fetch the release
            // and enrich from it. This avoids fingerprint/AcoustID picking a
            // different release per track and is the path the cluster pipeline
            // relies on. fetchReleaseDetails is in-flight-cached so concurrent
            // cluster tracks share one network call.
            if (item.mb_albumid) {
                const release = await fetchReleaseDetails(item.mb_albumid);
                if (release) {
                    return applyClusterReleaseToItem(item, release);
                }
            }

            let recording: Recording | null = null;

            // Primary path: fingerprint → AcoustID → MusicBrainz. May fail for
            // formats fpcalc doesn't support (e.g. m4a), or when AcoustID has
            // no match for the fingerprint.
            try {
                const chromaprint = await getAcoustidFingerprint(item.path);
                const acoustidResponse = await acoustIDLookup(chromaprint.fingerprint, chromaprint.duration);
                if (acoustidResponse.status === 'ok' && acoustidResponse.results?.length) {
                    recording = await getMusicBrainzData(acoustidResponse.results, item.path);
                }
            } catch (err) {
                console.debug(`Fingerprint path failed for ${item.path}: ${err instanceof Error ? err.message : String(err)}. Trying text search...`);
            }

            // Fallback: text search by (artist, title, album) when fingerprinting
            // gave us nothing. Requires at least artist + title tags from the file.
            if (!recording && item.artist && item.title) {
                const recordingId = await searchMusicBrainzByText(item.artist, item.title, item.album);
                if (recordingId) {
                    try {
                        const mb = await fetchMusicBrainz(recordingId);
                        // No AcoustID context for text-matched results - pass a stub
                        const fakeAcoustId: AcoustIDResult = { id: '', score: 0, recordings: [] };
                        recording = await toRecording(mb, fakeAcoustId, item.path);
                    } catch (err) {
                        console.debug(`Text-search recording fetch failed for ${item.path}: ${err instanceof Error ? err.message : String(err)}`);
                    }
                }
            }

            // Return original item if no recording found by either path
            if (!recording) {
                return item;
            }

            // Note: Confidence is now fixed at baseConfidence to avoid race conditions under Promise.all
            // The acoustIdScore affects the quality of the data, but confidence remains constant
            // TODO [Arch-1]: Move to Result<Partial<Item>, Error> to return per-call confidence

            // Map Recording to Item fields
            return {
                ...item,
                title: recording.title || item.title,
                artist: recording.artists[0] || item.artist,
                artists: recording.artists.join(', ') || item.artists,
                albumartist: recording.albumArtist || item.albumartist,
                mb_trackid: recording.musicbrainzId || item.mb_trackid,
                mb_artistid: recording.artistIds[0] || item.mb_artistid,
                mb_artistids: recording.artistIds.join(', ') || item.mb_artistids,
                mb_albumartistid: recording.albumArtistIds?.[0] || item.mb_albumartistid,
                mb_albumartistids: recording.albumArtistIds?.join(', ') || item.mb_albumartistids,
                mb_albumid: recording.releaseId || item.mb_albumid,
                mb_releasegroupid: recording.releaseGroupId || item.mb_releasegroupid,
                mb_releasetrackid: recording.releaseTrackId || item.mb_releasetrackid,
                acoustid_id: recording.acoustIdId || item.acoustid_id,
                track: recording.trackNumber ?? item.track,
                tracktotal: recording.trackTotal ?? item.tracktotal,
                disc: recording.discNumber ?? item.disc,
                disctotal: recording.discTotal ?? item.disctotal,
                length: recording.duration || item.length,
                album: recording.releaseTitle || item.album,
                year: recording.releaseDate ? new Date(recording.releaseDate).getFullYear() : item.year,
                month: recording.releaseDate ? new Date(recording.releaseDate).getMonth() + 1 : item.month,
                day: recording.releaseDate ? new Date(recording.releaseDate).getDate() : item.day,
                country: recording.releaseCountry || item.country,
                albumstatus: recording.releaseStatus || item.albumstatus,
                isrc: recording.isrc || item.isrc,
                barcode: recording.barcode || item.barcode,
                asin: recording.asin || item.asin,
                catalognum: recording.catalogNumber || item.catalognum,
                label: recording.label || item.label,
            };
        } catch (error) {
            // Silently fail and return original item (e.g., fpcalc errors, unsupported formats)
            console.debug(`MusicBrainz lookup failed for ${item.path}: ${error instanceof Error ? error.message : String(error)}`);
            return item;
        }
    }
}

