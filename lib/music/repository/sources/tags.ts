import { getLocalTags } from '../../metadata/local-tags';
import { ScoredTrackData, TrackData } from '../types';

/**
 * Reads local file tags and returns scored track data
 * Confidence: 0.5 (file tags are present but may be incorrect)
 */
export async function readLocalTags(filePath: string): Promise<ScoredTrackData> {
    console.log('    → Reading file tags from:', filePath);
    const tags = await getLocalTags(filePath);

    console.log('    → Raw tags read:', {
        title: tags.title,
        artist: tags.artist,
        artists: tags.artists,
        album: tags.album,
        albumArtist: tags.albumArtist,
        track: tags.track,
        year: tags.year,
        duration: tags.duration,
        hasMusicBrainzId: !!tags.musicbrainzRecordingId,
        hasReleaseId: !!tags.musicbrainzReleaseId
    });

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

    console.log('    → Parsed track data with confidence 0.5');

    return {
        data: trackData,
        confidence: 0.5,
        source: 'tags',
    };
}
