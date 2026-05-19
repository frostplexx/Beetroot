import { globalConfig } from "../../../../config";
import { DataSource } from "../../types";
import { Item } from "../../../database";
import * as fs from 'fs';
import path from "path";

const LASTFM_BASE_URL = 'https://ws.audioscrobbler.com/2.0';



export class LastfmGenreSource extends DataSource {
    readonly confidence = 0.7;
    private validGenres: string[] | null = null;

    async getData(item: Item): Promise<Item> {

        if (globalConfig.lastfm_api_key === undefined) {
            throw new Error('LASTFM_API_KEY not set');
        }

        const genres = await this.fetchGenres(item.albumartist || item.artist, item.album);
        return { ...item, genres };
    }


    private getValidGenres(): string[] {
        // Cache genres list for performance
        if (this.validGenres !== null) {
            return this.validGenres;
        }

        try {
            // Load genres from genres.txt
            const genresPath = path.join(__dirname, 'genres.txt');
            const data = fs.readFileSync(genresPath, 'utf8');
            this.validGenres = data.split('\n').map(line => line.trim().toLowerCase()).filter(line => line.length > 0);
            console.log(`Loaded ${this.validGenres.length} valid genres from genres.txt`);
            return this.validGenres;
        } catch (err) {
            console.error('Error reading genres.txt:', err);
            this.validGenres = [];
            return [];
        }
    }

    async fetchGenres(artistName: string, albumTitle: string): Promise<string[]> {
        if (!globalConfig.lastfm_api_key) throw new Error('LASTFM_API_KEY not set');
        if (!artistName) return [];

        const params = new URLSearchParams({
            method: 'album.getTopTags',
            artist: artistName,
            album: albumTitle,
            api_key: globalConfig.lastfm_api_key,
            format: 'json',
            autocorrect: '1',
        });

        const response = await fetch(`${LASTFM_BASE_URL}/?${params}`);
        
        console.log(response.body)


        if (!response.ok) return [];

        const data = await response.json();
        const tags: Array<{ name: string; count: number }> = data.toptags?.tag ?? [];


        // filter anything that isn't in the genres.txt list
        const genres = this.getValidGenres();
        return tags
            .map(t => t.name)
            .filter(t => genres.includes(t.toLocaleLowerCase()));
    }
}

