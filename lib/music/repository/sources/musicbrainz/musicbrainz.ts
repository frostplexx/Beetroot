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
    'release-group'?: MusicBrainzReleaseGroup;
    'artist-credit'?: Array<{
        artist: { id: string; name: string };
        joinphrase?: string;
    }>;
}

export interface MusicBrainzRecording {
    id: string;
    title: string;
    length?: number;
    disambiguation?: string;
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
    releaseId?: string;
    releaseTitle?: string;
    releaseDate?: string;
    releaseCountry?: string;
    releaseStatus?: string;
    filePath: string;
}

async function fetchMusicBrainz(recordingId: string, retryCount = 0): Promise<MusicBrainzRecording> {
    const maxRetries = 3;

    try {
        const response = await rateLimitedFetch(
            `${BASE_URL}/recording/${recordingId}?inc=artists+releases+release-groups&fmt=json`,
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

    return {
        musicbrainzId: mb.id,
        acoustIdId: acoustIdResult.id,
        acoustIdScore: acoustIdResult.score,
        title: mb.title,
        duration: mb.length,
        disambiguation: mb.disambiguation,
        artists: mb['artist-credit'].map(a => a.artist.name),
        artistIds: mb['artist-credit'].map(a => a.artist.id),
        releaseId: primaryRelease?.id,
        releaseTitle: primaryRelease?.title,
        releaseDate: primaryRelease?.date,
        releaseCountry: primaryRelease?.country,
        releaseStatus: primaryRelease?.status,
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

