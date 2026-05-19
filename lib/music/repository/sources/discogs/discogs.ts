import { globalConfig } from "../../../../config";
import { DataSource } from "../../types";
import { Item } from "../../../database";

const DISCOGS_BASE_URL = 'https://api.discogs.com';
const USER_AGENT = 'Beetroot/0.1.0';

// Rate limiting: Discogs allows 60 requests per minute for authenticated requests
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second to be safe

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function rateLimitedFetch(url: string): Promise<Response> {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;

    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        await sleep(waitTime);
    }

    lastRequestTime = Date.now();

    const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
    };

    if (globalConfig.discogs_token) {
        headers['Authorization'] = `Discogs token=${globalConfig.discogs_token}`;
    }

    return fetch(url, { headers });
}

interface DiscogsSearchResult {
    id: number;
    title: string;
    year?: string;
    genre?: string[];
    style?: string[];
    label?: string[];
    country?: string;
    type: string;
}

interface DiscogsRelease {
    id: number;
    title: string;
    year?: number;
    genres?: string[];
    styles?: string[];
    labels?: Array<{ name: string; catno?: string }>;
    country?: string;
    artists?: Array<{ name: string; id: number }>;
    tracklist?: Array<{ title: string; position: string; duration?: string }>;
}

export class DiscogsSource extends DataSource {
    readonly confidence = 0.75;

    async getData(item: Item): Promise<Item> {
        try {
            if (!item.artist || !item.album) {
                return item;
            }

            // Search for release
            const release = await this.searchRelease(item.artist, item.album);

            if (!release) {
                return item;
            }

            // Get detailed release info
            const details = await this.getReleaseDetails(release.id);

            if (!details) {
                return item;
            }

            return {
                ...item,
                year: details.year || item.year,
                genres: this.mergeGenres(item.genres, details.genres, details.styles),
                country: details.country || item.country,
                label: details.labels?.[0]?.name || item.label,
                catalognum: details.labels?.[0]?.catno || item.catalognum,
                discogs_albumid: details.id || item.discogs_albumid,
            };
        } catch (error) {
            console.debug(`Discogs lookup failed for ${item.path}:`, error);
            return item;
        }
    }

    private async searchRelease(artist: string, album: string): Promise<DiscogsSearchResult | null> {
        try {
            const query = encodeURIComponent(`${artist} ${album}`);
            const url = `${DISCOGS_BASE_URL}/database/search?q=${query}&type=release&per_page=5`;

            const response = await rateLimitedFetch(url);

            if (!response.ok) {
                return null;
            }

            const data = await response.json();
            const results = data.results as DiscogsSearchResult[];

            // Return the first master or release result
            return results.find(r => r.type === 'master' || r.type === 'release') || null;
        } catch (error) {
            console.debug('Discogs search failed:', error);
            return null;
        }
    }

    private async getReleaseDetails(releaseId: number): Promise<DiscogsRelease | null> {
        try {
            // Try master first, then release
            let url = `${DISCOGS_BASE_URL}/masters/${releaseId}`;
            let response = await rateLimitedFetch(url);

            if (!response.ok) {
                url = `${DISCOGS_BASE_URL}/releases/${releaseId}`;
                response = await rateLimitedFetch(url);
            }

            if (!response.ok) {
                return null;
            }

            return await response.json();
        } catch (error) {
            console.debug('Discogs release details failed:', error);
            return null;
        }
    }

    private mergeGenres(existing: string[] | null, genres?: string[], styles?: string[]): string[] {
        const merged = new Set<string>(existing || []);

        genres?.forEach(g => merged.add(g.toLowerCase()));
        styles?.forEach(s => merged.add(s.toLowerCase()));

        return Array.from(merged);
    }
}
