import { DataSource } from '../../types';
import { Item } from '../../../database';

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
    try {
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
        });

        if (!response.ok) {
            if (response.status === 404) {
                // No lyrics found
                return null;
            }
            throw new Error(`Lrclib API error ${response.status}: ${await response.text()}`);
        }

        return await response.json();
    } catch (error) {
        console.debug(`Lrclib lookup failed:`, error);
        return null;
    }
}

export class LrclibSource extends DataSource {
    readonly confidence = 0.8; // High confidence for lyrics

    async getData(item: Item): Promise<Item> {
        try {
            // Need at least title and artist
            if (!item.title || !item.artist) {
                return item;
            }

            const result = await fetchLyrics(
                item.title,
                item.artist,
                item.album || undefined,
                item.length || undefined
            );

            if (!result) {
                return item;
            }

            // Prefer synced lyrics (LRC format) over plain lyrics
            const lyrics = result.syncedLyrics || result.plainLyrics || null;

            return {
                ...item,
                lyrics: lyrics || item.lyrics,
            };
        } catch (error) {
            console.debug(`Lrclib lookup failed for ${item.path}:`, error);
            return item;
        }
    }
}
