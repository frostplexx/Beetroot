import { fetchGenres } from '../../metadata/genre';
import { ScoredTrackData, TrackData } from '../types';

/**
 * Fetches genre data from Last.fm
 * Confidence: 0.6 (Last.fm tags are user-generated but generally reliable)
 */
export async function fetchLastFmGenres(
    artist: string,
    album: string,
    filePath: string
): Promise<ScoredTrackData | null> {
    try {
        // Create a minimal MusicBrainz release object for fetchGenres
        const release = {
            title: album,
            'artist-credit': [
                {
                    artist: { name: artist, id: '', 'sort-name': '' },
                },
            ],
        };

        const genres = await fetchGenres(release as any);

        if (!genres || genres.length === 0) {
            return null;
        }

        const trackData: Partial<TrackData> = {
            genres,
            filePath,
        };

        return {
            data: trackData,
            confidence: 0.6,
            source: 'lastfm',
        };
    } catch (error) {
        console.warn('Failed to fetch Last.fm genres:', error);
        return null;
    }
}
