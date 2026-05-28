import { globalConfig } from "../../../../config";
import { DataSource } from "../../types";
import { Cluster } from "../../cluster";
import { Item } from "../../../database";
import { withRetry, isRetryableHttpError } from "../../utils/retry";

const DISCOGS_BASE_URL = 'https://api.discogs.com';
const USER_AGENT = 'Beetroot/2.0 +https://github.com/danielinama/beetroot daniel.inama02@gmail.com';

// 1200ms = 50 req/min, safely under Discogs' 60 req/min authenticated limit
const MIN_REQUEST_INTERVAL = 2200;

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Stored on global so HMR module reloads don't reset it and cause request bursts
function getRateLimitChain(): Promise<void> {
    const g = global as any;
    if (!g.__discogsRateLimitChain) {
        g.__discogsRateLimitChain = Promise.resolve();
    }
    return g.__discogsRateLimitChain;
}
function setRateLimitChain(p: Promise<void>): void {
    (global as any).__discogsRateLimitChain = p;
}

async function rateLimitedFetch(url: string): Promise<Response> {
    const mySlot = getRateLimitChain().then(async () => {
        await sleep(MIN_REQUEST_INTERVAL);
    });
    setRateLimitChain(mySlot);

    const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
    };

    if (globalConfig.discogs_token) {
        headers['Authorization'] = `Discogs token=${globalConfig.discogs_token}`;
    }

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
    // Stores Promises so concurrent requests for the same album await one in-flight fetch
    private releaseCache = new Map<string, Promise<DiscogsRelease | null>>();

    private cacheKey(artist: string, album: string): string {
        return `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`;
    }

    async seedCluster(cluster: Cluster): Promise<void> {
        const { seedAlbumArtist, seedAlbum } = cluster;
        if (!seedAlbumArtist || !seedAlbum) return;
        const key = this.cacheKey(seedAlbumArtist, seedAlbum);
        if (!this.releaseCache.has(key)) {
            this.releaseCache.set(key,
                this.searchRelease(seedAlbumArtist, seedAlbum)
                    .then(r => r ? this.getReleaseDetails(r.id, r.type) : null)
            );
        }
        await this.releaseCache.get(key);
    }

    async getData(item: Item): Promise<Item> {
        try {
            if (!item.artist || !item.album) {
                return item;
            }

            const artist = item.albumartist || item.artist;
            const key = this.cacheKey(artist, item.album);

            if (!this.releaseCache.has(key)) {
                this.releaseCache.set(key,
                    this.searchRelease(artist, item.album)
                        .then(r => r ? this.getReleaseDetails(r.id, r.type) : null)
                );
            }

            const details = await this.releaseCache.get(key)!;

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
                const errorText = await response.text();
                const error: any = new Error(`Discogs API error ${response.status}: ${errorText}`);
                error.response = response;
                error.status = response.status;
                throw error;
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
                const errorText = await response.text();
                const error: any = new Error(`Discogs API error ${response.status}: ${errorText}`);
                error.response = response;
                error.status = response.status;
                throw error;
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
