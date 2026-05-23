import { DataSource } from "../../types";
import { Item } from "../../../database";
import { withRetry, isRetryableHttpError } from "../../utils/retry";

const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php';

/**
 * Simple rate limiter to prevent hitting API rate limits
 * Ensures minimum delay between requests
 */
class RateLimiter {
    private lastRequestTime = 0;
    private queue: Array<() => void> = [];
    private processing = false;

    constructor(private minDelayMs: number) {}

    async acquire(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.queue.push(resolve);
            this.processQueue();
        });
    }

    private async processQueue(): Promise<void> {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;

        while (this.queue.length > 0) {
            const now = Date.now();
            const timeSinceLastRequest = now - this.lastRequestTime;
            const delay = Math.max(0, this.minDelayMs - timeSinceLastRequest);

            if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            this.lastRequestTime = Date.now();
            const resolve = this.queue.shift()!;
            resolve();
        }

        this.processing = false;
    }
}

// Rate limit: max 1 request per 200ms (5 requests/sec) to stay well under Wikipedia's limits
const wikipediaRateLimiter = new RateLimiter(200);
const wikidataRateLimiter = new RateLimiter(200);

interface WikipediaSearchResult {
    pageid: number;
    title: string;
}

interface WikidataEntity {
    id: string;
    labels?: { [lang: string]: { value: string } };
    claims?: {
        P136?: Array<{ // genre
            mainsnak: {
                datavalue?: {
                    value: { id: string };
                };
            };
        }>;
        P495?: Array<{ // country of origin
            mainsnak: {
                datavalue?: {
                    value: { id: string };
                };
            };
        }>;
        P577?: Array<{ // publication date
            mainsnak: {
                datavalue?: {
                    value: { time: string };
                };
            };
        }>;
    };
}

export class WikipediaSource extends DataSource {
    readonly confidence = 0.65;

    async getData(item: Item): Promise<Item> {
        try {
            if (!item.artist || !item.album) {
                return item;
            }

            // Search for album page
            const wikidataId = await this.findWikidataId(item.artist, item.album);

            if (!wikidataId) {
                return item;
            }

            // Get Wikidata entity
            const entity = await this.getWikidataEntity(wikidataId);

            if (!entity) {
                return item;
            }

            // Extract genres
            const genres = await this.extractGenres(entity);

            // Extract year
            const year = this.extractYear(entity);

            return {
                ...item,
                genres: this.mergeGenres(item.genres, genres),
                year: year || item.year,
            };
        } catch (error) {
            console.debug(`Wikipedia lookup failed for ${item.path}:`, error);
            return item;
        }
    }

    private async findWikidataId(artist: string, album: string): Promise<string | null> {
        return withRetry(async () => {
            // Rate limit Wikipedia API requests
            await wikipediaRateLimiter.acquire();

            // Search Wikipedia for the album
            const searchQuery = encodeURIComponent(`${album} ${artist} album`);
            const searchUrl = `${WIKIPEDIA_API_URL}?action=query&list=search&srsearch=${searchQuery}&format=json&origin=*`;

            const searchResponse = await fetch(searchUrl);

            if (!searchResponse.ok) {
                const errorText = await searchResponse.text();
                const error: any = new Error(`Wikipedia API error ${searchResponse.status}: ${errorText}`);
                error.response = searchResponse;
                error.status = searchResponse.status;
                throw error;
            }

            const searchData = await searchResponse.json();

            if (!searchData.query?.search?.length) {
                return null;
            }

            const pageTitle = searchData.query.search[0].title;

            // Rate limit second Wikipedia API request
            await wikipediaRateLimiter.acquire();

            // Get Wikidata ID from Wikipedia page
            const wikidataUrl = `${WIKIPEDIA_API_URL}?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageprops&format=json&origin=*`;
            const wikidataResponse = await fetch(wikidataUrl);

            if (!wikidataResponse.ok) {
                const errorText = await wikidataResponse.text();
                const error: any = new Error(`Wikipedia API error ${wikidataResponse.status}: ${errorText}`);
                error.response = wikidataResponse;
                error.status = wikidataResponse.status;
                throw error;
            }

            const wikidataData = await wikidataResponse.json();

            const pages = wikidataData.query?.pages;
            if (!pages) return null;

            const page = Object.values(pages)[0] as any;
            return page?.pageprops?.wikibase_item || null;
        }, {
            maxRetries: 4,
            baseDelay: 2000,
            backoff: 'exponential',
            shouldRetry: isRetryableHttpError,
        }).catch((error) => {
            console.debug('Wikipedia search failed:', error);
            return null;
        });
    }

    private async getWikidataEntity(wikidataId: string): Promise<WikidataEntity | null> {
        return withRetry(async () => {
            // Rate limit Wikidata API requests
            await wikidataRateLimiter.acquire();

            const url = `${WIKIDATA_API_URL}?action=wbgetentities&ids=${wikidataId}&format=json&origin=*`;
            const response = await fetch(url);

            if (!response.ok) {
                const errorText = await response.text();
                const error: any = new Error(`Wikidata API error ${response.status}: ${errorText}`);
                // Attach response for retry logic to potentially read Retry-After header
                error.response = response;
                error.status = response.status;
                throw error;
            }

            const data = await response.json();

            return data.entities?.[wikidataId] || null;
        }, {
            maxRetries: 4,
            baseDelay: 2000,
            backoff: 'exponential',
            shouldRetry: isRetryableHttpError,
        }).catch((error) => {
            console.debug('Wikidata fetch failed:', error);
            return null;
        });
    }

    private async extractGenres(entity: WikidataEntity): Promise<string[]> {
        const genres: string[] = [];

        if (!entity.claims?.P136) {
            return genres;
        }

        // Collect all genre IDs first
        const genreIds = entity.claims.P136
            .map(claim => claim.mainsnak.datavalue?.value.id)
            .filter((id): id is string => !!id);

        if (genreIds.length === 0) {
            return genres;
        }

        // Batch fetch all genre labels in one request (Wikidata supports up to 50 IDs)
        return withRetry(async () => {
            const url = `${WIKIDATA_API_URL}?action=wbgetentities&ids=${genreIds.join('|')}&format=json&origin=*`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Wikidata API error ${response.status}: ${await response.text()}`);
            }

            const data = await response.json();

            // Extract labels from all entities (keep original casing)
            for (const genreId of genreIds) {
                const genreLabel = data.entities?.[genreId]?.labels?.en?.value;
                if (genreLabel) {
                    genres.push(genreLabel); // Keep original casing - let merger handle normalization
                }
            }

            return genres;
        }, {
            maxRetries: 2,
            baseDelay: 1000,
            shouldRetry: isRetryableHttpError,
        }).catch((error) => {
            console.debug('Failed to fetch genre labels:', error);
            return genres;
        });
    }

    private extractYear(entity: WikidataEntity): number | null {
        const dateClaim = entity.claims?.P577?.[0];
        if (!dateClaim) return null;

        const dateString = dateClaim.mainsnak.datavalue?.value.time;
        if (!dateString) return null;

        // Wikidata time format: +YYYY-MM-DDT00:00:00Z
        const match = dateString.match(/\+(\d{4})-/);
        return match ? parseInt(match[1], 10) : null;
    }

    private mergeGenres(existing: string[] | null, newGenres: string[]): string[] {
        const merged = new Set<string>(existing || []);
        // Keep original casing - let merger handle normalization
        newGenres.forEach(g => merged.add(g));
        return Array.from(merged);
    }
}
