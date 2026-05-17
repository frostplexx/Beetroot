import { getMusicBrainzData } from '../../metadata/musicbrainz';
import { acoustIDLookup } from '../../metadata/acoustid';
import { ScoredTrackData, TrackData } from '../types';

/**
 * Fetches MusicBrainz data via AcoustID and returns scored track data
 * Confidence: 0.8 (MusicBrainz data is generally accurate when matched)
 */
export async function fetchMusicBrainzData(
    filePath: string,
    acoustIdFingerprint: string,
    duration: number
): Promise<ScoredTrackData | null> {
    try {
        // Lookup via AcoustID
        const acoustIdResponse = await acoustIDLookup(acoustIdFingerprint, duration);

        if (!acoustIdResponse.results || acoustIdResponse.results.length === 0) {
            return null;
        }

        // Get MusicBrainz data for the best match
        const recording = await getMusicBrainzData(acoustIdResponse.results, filePath);

        const trackData: Partial<TrackData> = {
            title: recording.title,
            artists: recording.artists,
            musicbrainzId: recording.musicbrainzId,
            acoustId: recording.acoustIdId,
            acoustIdScore: recording.acoustIdScore,
            releaseId: recording.releaseId,
            releaseTitle: recording.releaseTitle,
            releaseCountry: recording.releaseCountry,
            releaseStatus: recording.releaseStatus,
            artistIds: recording.artistIds,
            duration: recording.duration ? recording.duration / 1000 : undefined, // Convert ms to seconds
            filePath,
        };

        // Use acoustID score to determine confidence
        const confidence = Math.min(0.8, recording.acoustIdScore);

        return {
            data: trackData,
            confidence,
            source: 'musicbrainz',
        };
    } catch (error) {
        console.warn('Failed to fetch MusicBrainz data:', error);
        return null;
    }
}
