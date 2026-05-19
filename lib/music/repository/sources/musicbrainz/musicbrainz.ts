import { acoustIDLookup, AcoustIDResult, getAcoustidFingerprint } from "./acoustid";

const BASE_URL = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Beetroot/0.1.0 (https://github.com/yourusername/beetroot)';

// Rate limiting: MusicBrainz allows 1 request per second
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second

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
    const maxRetries = 3;

    try {
        const response = await rateLimitedFetch(
            `${BASE_URL}/recording/${recordingId}?inc=artists+releases+release-groups+isrcs&fmt=json`,
            { headers: { 'User-Agent': USER_AGENT } }
        );

        if (response.status === 503 && retryCount < maxRetries) {
            // Rate limit exceeded - exponential backoff
            const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 10000);
            console.warn(`Rate limited, retrying in ${backoffTime}ms (attempt ${retryCount + 1}/${maxRetries})...`);
            await sleep(backoffTime);
            return fetchMusicBrainz(recordingId, retryCount + 1);
        }

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`MusicBrainz API error ${response.status}: ${body}`);
        }

        return response.json();
    } catch (error) {
        if (retryCount < maxRetries && (error as any).message?.includes('503')) {
            const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 10000);
            console.warn(`Error fetching, retrying in ${backoffTime}ms...`);
            await sleep(backoffTime);
            return fetchMusicBrainz(recordingId, retryCount + 1);
        }
        throw error;
    }
}

async function fetchArtistCountry(artistId: string): Promise<string | undefined> {
    try {
        const response = await rateLimitedFetch(
            `${BASE_URL}/artist/${artistId}?fmt=json`,
            { headers: { 'User-Agent': USER_AGENT } }
        );
        if (!response.ok) return undefined;
        const data = await response.json();
        return data.area?.['iso-3166-1-codes']?.[0];
    } catch (error) {
        console.warn(`Failed to fetch artist country for ${artistId}:`, error);
        return undefined;
    }
}

async function fetchReleaseDetails(releaseId: string): Promise<MusicBrainzRelease | undefined> {
    try {
        const response = await rateLimitedFetch(
            `${BASE_URL}/release/${releaseId}?inc=artist-credits+recordings+release-groups+labels&fmt=json`,
            { headers: { 'User-Agent': USER_AGENT } }
        );
        if (!response.ok) return undefined;
        return await response.json();
    } catch (error) {
        console.warn(`Failed to fetch release details for ${releaseId}:`, error);
        return undefined;
    }
}

async function fetchReleaseAsin(releaseId: string): Promise<string | undefined> {
    try {
        const response = await rateLimitedFetch(
            `${BASE_URL}/release/${releaseId}?inc=url-rels&fmt=json`,
            { headers: { 'User-Agent': USER_AGENT } }
        );
        if (!response.ok) return undefined;
        const data = await response.json();

        // Look for Amazon ASIN in relations
        const amazonUrl = data.relations?.find((rel: any) =>
            rel.type === 'amazon asin' && rel.url?.resource
        );

        if (amazonUrl) {
            // Extract ASIN from URL (e.g., https://www.amazon.com/dp/B000001234)
            const match = amazonUrl.url.resource.match(/\/([A-Z0-9]{10})\/?/);
            return match?.[1];
        }

        return undefined;
    } catch (error) {
        console.warn(`Failed to fetch ASIN for ${releaseId}:`, error);
        return undefined;
    }
}

async function pickBestRelease(releases: MusicBrainzRelease[], artistId: string): Promise<MusicBrainzRelease | undefined> {
    if (!releases?.length) return undefined;

    const pool = releases.filter(r => r.status === 'Official');
    const candidates = pool.length ? pool : releases;

    const artistCountry = await fetchArtistCountry(artistId);

    const base = ['XW', 'US', 'GB', 'CA', 'AU', 'JP'];
    const preference = artistCountry && !base.includes(artistCountry)
        ? [artistCountry, 'XW', ...base.filter(c => c !== artistCountry)]
        : artistCountry
            ? [artistCountry, ...base.filter(c => c !== artistCountry)]
            : base;

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

    // Fetch full release details to get track/disc info
    let releaseDetails: MusicBrainzRelease | undefined;
    let trackInfo: { trackId?: string; trackNumber?: number; trackTotal?: number; discNumber?: number; discTotal?: number } = {};

    if (primaryRelease?.id) {
        releaseDetails = await fetchReleaseDetails(primaryRelease.id);

        // Find the track that matches this recording
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

    // Get album artist (from release or fallback to track artist)
    const albumArtistCredit = releaseDetails?.['artist-credit'] || primaryRelease?.['artist-credit'];
    const albumArtist = albumArtistCredit?.[0]?.artist.name;
    const albumArtistIds = albumArtistCredit?.map(a => a.artist.id);

    // Get ISRC (first one if multiple)
    const isrc = mb.isrcs?.[0];

    // Get barcode from release details or primary release
    const barcode = releaseDetails?.barcode || primaryRelease?.barcode;

    // Get label and catalog number
    const labelInfo = releaseDetails?.['label-info']?.[0];
    const label = labelInfo?.label?.name;
    const catalogNumber = labelInfo?.['catalog-number'];

    // Fetch ASIN if we have a release ID
    let asin: string | undefined;
    if (primaryRelease?.id) {
        asin = await fetchReleaseAsin(primaryRelease.id);
    }

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
): Promise<Recording> {
    if (acoustIdResults.length === 0) {
        throw new Error('No AcoustID results found');
    }

    for (const result of acoustIdResults) {
        if (!result.recordings?.length) continue;

        const recordingId = result.recordings[0].id;
        try {
            const mb = await fetchMusicBrainz(recordingId);
            return await toRecording(mb, result, filePath);
        } catch (error) {
            console.warn(`Failed to fetch recording ${recordingId}, trying next...`, error);
        }
    }

    throw new Error('All AcoustID results failed MusicBrainz lookup');
}

import { DataSource } from '../../types';
import { Item } from '../../../database';

export class MusicBrainzSource extends DataSource {
    private readonly baseConfidence = 0.85;
    confidence = 0.85;

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

            // Adjust confidence based on AcoustID score (0.0 - 1.0)
            this.confidence = this.baseConfidence * recording.acoustIdScore;

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
            // Silently fail and return original item
            console.debug(`MusicBrainz lookup failed for ${item.path}:`, error);
            return item;
        }
    }
}

