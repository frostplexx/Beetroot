import { acoustIDLookup, AcoustIDResult, getAcoustidFingerprint } from "./acoustid";

const BASE_URL = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Beetroot/0.1.0 (https://github.com/yourusername/beetroot)';

// Rate limiting: MusicBrainz allows 1 request per second per IP on average
// Per their docs: https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
// Using 1.5s to be more conservative and avoid rate limit errors
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1500; // 1.5 seconds - more conservative than the required 1s

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function rateLimitedFetch(url: string, options?: RequestInit): Promise<Response> {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;

    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        await sleep(waitTime);
    }

    lastRequestTime = Date.now();
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

async function fetchMusicBrainz(recordingId: string, retryCount = 0): Promise<MusicBrainzRecording> {
    const maxRetries = 10;

    try {
        // Fetch recording data with minimal release info for picking best release
        const response = await rateLimitedFetch(
            `${BASE_URL}/recording/${recordingId}?inc=artists+releases+release-groups+isrcs&fmt=json`,
            { headers: { 'User-Agent': USER_AGENT } }
        );

        // Retry on server errors (5xx) and rate limits (429, 503)
        const shouldRetry = response.status >= 500 || response.status === 429 || response.status === 503;
        if (shouldRetry && retryCount < maxRetries) {
            // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 64s, up to 120s max
            const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 120000);
            console.debug(`MusicBrainz ${response.status} error, retrying in ${backoffTime}ms (attempt ${retryCount + 1}/${maxRetries})...`);
            await sleep(backoffTime);
            return fetchMusicBrainz(recordingId, retryCount + 1);
        }

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`MusicBrainz API error ${response.status}: ${body}`);
        }

        return response.json();
    } catch (error) {
        // Retry on network errors and transient failures
        if (retryCount < maxRetries) {
            const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 120000);
            console.debug(`Error fetching recording ${recordingId}, retrying in ${backoffTime}ms (attempt ${retryCount + 1}/${maxRetries})...`);
            await sleep(backoffTime);
            return fetchMusicBrainz(recordingId, retryCount + 1);
        }
        throw error;
    }
}

async function fetchReleaseDetails(releaseId: string, retryCount = 0): Promise<MusicBrainzRelease | undefined> {
    const maxRetries = 10;

    try {
        // Fetch complete release data including media, tracks, labels, etc.
        const response = await rateLimitedFetch(
            `${BASE_URL}/release/${releaseId}?inc=artist-credits+recordings+release-groups+labels+media&fmt=json`,
            { headers: { 'User-Agent': USER_AGENT } }
        );

        // Retry on server errors (5xx) and rate limits (429, 503)
        const shouldRetry = response.status >= 500 || response.status === 429 || response.status === 503;
        if (shouldRetry && retryCount < maxRetries) {
            const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 120000);
            console.debug(`MusicBrainz ${response.status} error fetching release, retrying in ${backoffTime}ms (attempt ${retryCount + 1}/${maxRetries})...`);
            await sleep(backoffTime);
            return fetchReleaseDetails(releaseId, retryCount + 1);
        }

        if (!response.ok) return undefined;
        return await response.json();
    } catch (error) {
        // Retry on network errors and transient failures
        if (retryCount < maxRetries) {
            const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 120000);
            console.debug(`Error fetching release ${releaseId}, retrying in ${backoffTime}ms (attempt ${retryCount + 1}/${maxRetries})...`);
            await sleep(backoffTime);
            return fetchReleaseDetails(releaseId, retryCount + 1);
        }
        console.debug(`Failed to fetch release details for ${releaseId} after ${maxRetries} retries`);
        return undefined;
    }
}

async function pickBestRelease(releases: MusicBrainzRelease[], artistId: string): Promise<MusicBrainzRelease | undefined> {
    if (!releases?.length) return undefined;

    const pool = releases.filter(r => r.status === 'Official');
    const candidates = pool.length ? pool : releases;

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

import { DataSource } from '../../types';
import { Item } from '../../../database';

export class MusicBrainzSource extends DataSource {
    private readonly baseConfidence = 0.85;
    readonly confidence = 0.85;

    async getData(item: Item): Promise<Item> {
        try {
            // Get fingerprint from file
            const chromaprint = await getAcoustidFingerprint(item.path);

            // Lookup on AcoustID
            const acoustidResponse = await acoustIDLookup(chromaprint.fingerprint, chromaprint.duration);

            if (acoustidResponse.status !== 'ok' || !acoustidResponse.results?.length) {
                return item;
            }

            // Get MusicBrainz data
            const recording = await getMusicBrainzData(acoustidResponse.results, item.path);

            // Return original item if no recording found
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

