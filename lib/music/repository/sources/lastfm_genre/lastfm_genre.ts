import { globalConfig } from "../../../../config";
import { DataSource } from "../../types";
import { Cluster } from "../../cluster";
import { Item } from "../../../database";
import { withRetry, isRetryableHttpError } from "../../utils/retry";
import * as fs from 'fs';
import path from "path";

const LASTFM_BASE_URL = 'https://ws.audioscrobbler.com/2.0';



export class LastfmGenreSource extends DataSource {
    readonly confidence = 0.7;
    private validGenres: string[] | null = null;
    // Stores Promises so concurrent requests for the same album await one in-flight fetch
    private albumCache = new Map<string, Promise<string[]>>();

    private cacheKey(artist: string, album: string): string {
        return `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`;
    }

    async seedCluster(cluster: Cluster): Promise<void> {
        const { seedAlbumArtist, seedAlbum } = cluster;
        if (!globalConfig.lastfm_api_key || !seedAlbumArtist || !seedAlbum) return;
        const key = this.cacheKey(seedAlbumArtist, seedAlbum);
        if (!this.albumCache.has(key)) {
            this.albumCache.set(key, this.fetchGenres(seedAlbumArtist, seedAlbum));
        }
        await this.albumCache.get(key);
    }

    async getData(item: Item): Promise<Item> {
        // If API key not configured, skip this source silently
        if (globalConfig.lastfm_api_key === undefined) {
            console.debug('Last.fm API key not configured, skipping genre fetch');
            return item;
        }

        const artist = item.albumartist || item.artist;
        const key = this.cacheKey(artist, item.album);

        if (!this.albumCache.has(key)) {
            this.albumCache.set(key, this.fetchGenres(artist, item.album));
        }

        const genres = await this.albumCache.get(key)!;
        return { ...item, genres };
    }


    private getValidGenres(): string[] {
        // Cache genres list for performance
        if (this.validGenres !== null) {
            return this.validGenres;
        }

        try {
            // Load genres from genres.txt (use path relative to project root)
            const genresPath = path.join(process.cwd(), 'lib/music/repository/sources/lastfm_genre/genres.txt');
            const data = fs.readFileSync(genresPath, 'utf8');
            this.validGenres = data.split('\n').map(line => line.trim().toLowerCase()).filter(line => line.length > 0);
            console.debug(`Loaded ${this.validGenres.length} valid genres from genres.txt`);
            return this.validGenres;
        } catch (err) {
            console.error(`Failed to read genres.txt: ${err instanceof Error ? err.message : String(err)}`);
            this.validGenres = [];
            return [];
        }
    }

    async fetchGenres(artistName: string, albumTitle: string): Promise<string[]> {
        if (!globalConfig.lastfm_api_key) throw new Error('LASTFM_API_KEY not set');
        if (!artistName) return [];

        return withRetry(async () => {
            const params = new URLSearchParams({
                method: 'album.getTopTags',
                artist: artistName,
                album: albumTitle,
                api_key: globalConfig.lastfm_api_key!,
                format: 'json',
                autocorrect: '1',
            });

            const response = await fetch(`${LASTFM_BASE_URL}/?${params}`);

            if (!response.ok) {
                throw new Error(`Last.fm API error ${response.status}: ${await response.text()}`);
            }

            const data = await response.json();
            // Last.fm returns a single object when there's only one tag, not an array
            const rawTags = data.toptags?.tag ?? [];
            const tags: Array<{ name: string; count: number }> = Array.isArray(rawTags) ? rawTags : [rawTags];

            // filter anything that isn't in the genres.txt list
            const genres = this.getValidGenres();
            return tags
                .map(t => t.name)
                .filter(t => genres.includes(t.toLocaleLowerCase()));
        }, {
            maxRetries: 3,
            baseDelay: 1000,
            shouldRetry: isRetryableHttpError,
        }).catch((error) => {
            console.debug('Last.fm genre fetch failed:', error);
            return [];
        });
    }
}

