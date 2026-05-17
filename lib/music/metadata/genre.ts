import { globalConfig } from "../../config";
import { MusicBrainzRelease } from "./musicbrainz";

const LASTFM_BASE_URL = 'https://ws.audioscrobbler.com/2.0';

export async function fetchGenres(release: MusicBrainzRelease): Promise<string[]> {
    if (!globalConfig.lastfm_api_key) throw new Error('LASTFM_API_KEY not set');

    const artistName = release['artist-credit']?.[0]?.artist.name;
    if (!artistName) return [];

    const params = new URLSearchParams({
        method: 'album.getTopTags',
        artist: artistName,
        album: release.title,
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
