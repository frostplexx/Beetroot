import { globalConfig } from "../../../../config";
import { DataSource } from "../../types";
import { Item } from "../../../database";
import { withRetry, isRetryableHttpError } from "../../utils/retry";

const DISCOGS_BASE_URL = 'https://api.discogs.com';
const USER_AGENT = 'Beetroot/0.1.0';

// Rate limiting: Discogs allows 60 requests per minute for authenticated requests
const MIN_REQUEST_INTERVAL = 1000; // 1 second to be safe

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Promise chain for rate limiting - ensures sequential execution
let rateLimitChain: Promise<void> = Promise.resolve();

async function rateLimitedFetch(url: string): Promise<Response> {
    // Chain this request after the previous one
    const mySlot = rateLimitChain.then(async () => {
        await sleep(MIN_REQUEST_INTERVAL);
    });

    // Update chain for next request
    rateLimitChain = mySlot;

    const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
    };

    if (globalConfig.discogs_token) {
        headers['Authorization'] = `Discogs token=${globalConfig.discogs_token}`;
    }

    // Wait for our slot, then execute
    await mySlot;
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

            // Get detailed release info (use type to determine endpoint)
            const details = await this.getReleaseDetails(release.id, release.type);

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
        return withRetry(async () => {
            const query = encodeURIComponent(`${artist} ${album}`);
            const url = `${DISCOGS_BASE_URL}/database/search?q=${query}&type=release&per_page=5`;

            const response = await rateLimitedFetch(url);

            if (!response.ok) {
                throw new Error(`Discogs API error ${response.status}: ${await response.text()}`);
            }

            const data = await response.json();
            const results = data.results as DiscogsSearchResult[];

            // Return the first master or release result
            return results.find(r => r.type === 'master' || r.type === 'release') || null;
        }, {
            maxRetries: 5,
            baseDelay: 1000,
            shouldRetry: isRetryableHttpError,
        }).catch((error) => {
            console.debug('Discogs search failed:', error);
            return null;
        });
    }

    private async getReleaseDetails(releaseId: number, type: string): Promise<DiscogsRelease | null> {
        return withRetry(async () => {
            // Use the correct endpoint based on type from search result
            const endpoint = type === 'master' ? 'masters' : 'releases';
            const url = `${DISCOGS_BASE_URL}/${endpoint}/${releaseId}`;
            const response = await rateLimitedFetch(url);

            if (!response.ok) {
                throw new Error(`Discogs API error ${response.status}: ${await response.text()}`);
            }

            return await response.json();
        }, {
            maxRetries: 5,
            baseDelay: 1000,
            shouldRetry: isRetryableHttpError,
        }).catch((error) => {
            console.debug('Discogs release details failed:', error);
            return null;
        });
    }

    private mergeGenres(existing: string[] | null, genres?: string[], styles?: string[]): string[] {
        const merged = new Set<string>(existing || []);

        // Keep original casing - let merger handle normalization
        genres?.forEach(g => merged.add(g));
        styles?.forEach(s => merged.add(s));

        return Array.from(merged);
    }
}
