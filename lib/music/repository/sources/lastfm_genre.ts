import { globalConfig } from "@/lib/config";
import { DataSource } from "../types";
import { Item } from "../../database";

const LASTFM_BASE_URL = 'https://ws.audioscrobbler.com/2.0';



export class LastfmGenreSource extends DataSource {
    readonly confidence = 0.7;

    async getData(item: Item): Promise<Item> {
        const genres = await this.fetchGenres(item.albumartist || '', item.album);
        return { ...item, genres };
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
        if (!response.ok) return [];

        const data = await response.json();
        const tags: Array<{ name: string; count: number }> = data.toptags?.tag ?? [];

        return tags
            .filter(t => t.count > 10)     // drop low-confidence tags
            .map(t => t.name.toLowerCase())
            .filter(t => !['seen live', 'favourite', 'love'].includes(t)); // drop user junk tags
    }
}

