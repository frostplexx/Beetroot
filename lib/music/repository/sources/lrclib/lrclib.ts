import { DataSource } from '../../types';
import { Cluster } from '../../cluster';
import { Item } from '../../../database';
import { withRetry, isRetryableHttpError } from '../../utils/retry';

const BASE_URL = 'https://lrclib.net/api';

interface LrclibResponse {
    id: number;
    trackName: string;
    artistName: string;
    albumName: string;
    duration: number;
    instrumental: boolean;
    plainLyrics: string | null;
    syncedLyrics: string | null;
}

async function fetchLyrics(track: string, artist: string, album?: string, duration?: number): Promise<LrclibResponse | null> {
    return withRetry(async () => {
        const params = new URLSearchParams({
            track_name: track,
            artist_name: artist,
        });

        if (album) {
            params.append('album_name', album);
        }

        if (duration) {
            // Convert to seconds and round
            params.append('duration', Math.round(duration).toString());
        }

        const response = await fetch(`${BASE_URL}/get?${params.toString()}`, {
            headers: {
                'User-Agent': 'Beetroot/0.1.0 (https://github.com/yourusername/beetroot)',
            },
            signal: AbortSignal.timeout(15_000),
        });

        if (response.status === 404) {
            // No lyrics found - not an error
            return null;
        }

        if (!response.ok) {
            throw new Error(`Lrclib API error ${response.status}: ${await response.text()}`);
        }

        return await response.json();
    }, {
        maxRetries: 2,
        baseDelay: 500,
        shouldRetry: isRetryableHttpError,
    }).catch((error) => {
        console.debug(`Lrclib lookup failed:`, error);
        return null;
    });
}

export class LrclibSource extends DataSource {
    readonly confidence = 0.8;
    // Stores Promises so concurrent getData calls and seedCluster share one in-flight fetch per track
    private lyricsCache = new Map<string, Promise<LrclibResponse | null>>();

    private cacheKey(title: string, artist: string): string {
        return `${artist.toLowerCase().trim()}|${title.toLowerCase().trim()}`;
    }

    async seedCluster(cluster: Cluster): Promise<void> {
        // Fire all track lyrics requests in parallel — collapses n sequential
        // batches into one parallel burst for the whole cluster.
        await Promise.all(
            cluster.tracks
                .filter(t => t.title && t.artist)
                .map(t => {
                    const key = this.cacheKey(t.title!, t.artist!);
                    if (!this.lyricsCache.has(key)) {
                        this.lyricsCache.set(key, fetchLyrics(
                            t.title!, t.artist!, t.album || undefined, t.length || undefined
                        ));
                    }
                    return this.lyricsCache.get(key);
                })
        );
    }

    async getData(item: Item): Promise<Item> {
        try {
            if (!item.title || !item.artist) {
                return item;
            }

            const key = this.cacheKey(item.title, item.artist);
            if (!this.lyricsCache.has(key)) {
                this.lyricsCache.set(key, fetchLyrics(
                    item.title, item.artist, item.album || undefined, item.length || undefined
                ));
            }

            const result = await this.lyricsCache.get(key)!;

            if (!result) {
                return item;
            }

            const lyrics = result.syncedLyrics || result.plainLyrics || null;
            return { ...item, lyrics: lyrics || item.lyrics };
        } catch (error) {
            console.debug(`Lrclib lookup failed for ${item.path}:`, error);
            return item;
        }
    }
}
