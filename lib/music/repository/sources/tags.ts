import { getLocalTags } from '../../metadata/local-tags';
import { ScoredTrackData, TrackData } from '../types';

/**
 * Reads local file tags and returns scored track data
 * Confidence: 0.5 (file tags are present but may be incorrect)
 */
export async function readLocalTags(filePath: string): Promise<ScoredTrackData> {
    const tags = await getLocalTags(filePath);

    const trackData: Partial<TrackData> = {
        title: tags.title || undefined,
        artists: tags.artists || (tags.artist ? [tags.artist] : undefined),
        album: tags.album || undefined,
        albumArtist: tags.albumArtist || undefined,
        trackNumber: tags.track || undefined,
        trackTotal: tags.trackTotal || undefined,
        discNumber: tags.disc || undefined,
        discTotal: tags.discTotal || undefined,
        year: tags.year || undefined,
        genres: tags.genre || undefined,
        duration: tags.duration || undefined,
        compilation: tags.compilation || undefined,
        label: tags.label?.[0] || undefined,
        isrc: tags.isrc?.[0] || undefined,
        musicbrainzId: tags.musicbrainzRecordingId || undefined,
        releaseId: tags.musicbrainzReleaseId || undefined,
        acoustId: tags.acoustidId || undefined,
        filePath,
    };

    return {
        data: trackData,
        confidence: 0.5,
        source: 'tags',
    };
}
