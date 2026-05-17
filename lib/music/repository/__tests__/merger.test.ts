import { mergeTrackData } from '../merger';
import { ScoredTrackData, TrackData, DataSource } from '../types';

describe('mergeTrackData', () => {
    const filePath = '/music/test.mp3';

    it('should merge track data from multiple sources using confidence scores', () => {
        const sources: ScoredTrackData[] = [
            {
                data: {
                    title: 'Wrong Title',
                    artists: ['Artist A'],
                    filePath,
                },
                confidence: 0.5,
                source: 'tags',
            },
            {
                data: {
                    title: 'Correct Title',
                    artists: ['Artist A'],
                    album: 'Album Name',
                    filePath,
                },
                confidence: 0.8,
                source: 'musicbrainz',
            },
        ];

        const { merged, conflicts } = mergeTrackData(sources);

        expect(merged.title).toBe('Correct Title'); // Higher confidence wins
        expect(merged.artists).toEqual(['Artist A']);
        expect(merged.album).toBe('Album Name');
        expect(conflicts.length).toBe(0);
    });

    it('should prefer file tags for duration over MusicBrainz', () => {
        const sources: ScoredTrackData[] = [
            {
                data: {
                    title: 'Test',
                    duration: 180.5, // File duration
                    filePath,
                },
                confidence: 0.5,
                source: 'tags',
            },
            {
                data: {
                    title: 'Test',
                    duration: 180.0, // MB duration (less accurate)
                    filePath,
                },
                confidence: 0.8,
                source: 'musicbrainz',
            },
        ];

        const { merged } = mergeTrackData(sources);

        expect(merged.duration).toBe(180.5); // Tags duration should be preferred
    });

    it('should detect conflicts when values differ from database', () => {
        const sources: ScoredTrackData[] = [
            {
                data: {
                    title: 'New Title',
                    filePath,
                },
                confidence: 0.5,
                source: 'tags',
            },
        ];

        const existingData: Partial<TrackData> = {
            title: 'Old Title',
            filePath,
        };

        const existingSources = {
            title: 'user' as DataSource,
        };

        const { merged, conflicts } = mergeTrackData(
            sources,
            existingData,
            existingSources,
            'manual'
        );

        expect(conflicts.length).toBe(1);
        expect(conflicts[0].field).toBe('title');
        expect(conflicts[0].dbValue).toBe('Old Title');
        expect(conflicts[0].fileValue).toBe('New Title');
    });

    it('should apply conflict resolution strategy "keep-db"', () => {
        const sources: ScoredTrackData[] = [
            {
                data: {
                    title: 'File Title',
                    filePath,
                },
                confidence: 0.5,
                source: 'tags',
            },
        ];

        const existingData: Partial<TrackData> = {
            title: 'DB Title',
            filePath,
        };

        const existingSources = {
            title: 'user' as DataSource,
        };

        const { merged } = mergeTrackData(
            sources,
            existingData,
            existingSources,
            'keep-db'
        );

        expect(merged.title).toBe('DB Title');
    });

    it('should apply conflict resolution strategy "keep-file"', () => {
        const sources: ScoredTrackData[] = [
            {
                data: {
                    title: 'File Title',
                    filePath,
                },
                confidence: 0.5,
                source: 'tags',
            },
        ];

        const existingData: Partial<TrackData> = {
            title: 'DB Title',
            filePath,
        };

        const existingSources = {
            title: 'user' as DataSource,
        };

        const { merged } = mergeTrackData(
            sources,
            existingData,
            existingSources,
            'keep-file'
        );

        expect(merged.title).toBe('File Title');
    });

    it('should merge and canonicalize genres', () => {
        const sources: ScoredTrackData[] = [
            {
                data: {
                    genres: ['rock', 'alternative rock'],
                    filePath,
                },
                confidence: 0.5,
                source: 'tags',
            },
            {
                data: {
                    genres: ['indie', 'rock'],
                    filePath,
                },
                confidence: 0.6,
                source: 'lastfm',
            },
        ];

        const { merged } = mergeTrackData(sources);

        // Should merge and deduplicate
        expect(merged.genres).toBeDefined();
        expect(merged.genres!.length).toBeGreaterThan(0);
        expect(new Set(merged.genres).size).toBe(merged.genres!.length); // No duplicates
    });

    it('should calculate file hash', () => {
        const sources: ScoredTrackData[] = [
            {
                data: {
                    title: 'Test',
                    filePath: __filename, // Use this test file
                },
                confidence: 0.5,
                source: 'tags',
            },
        ];

        const { merged } = mergeTrackData(sources);

        expect(merged.fileHash).toBeDefined();
        expect(merged.fileHash!.length).toBe(32); // MD5 hex string
    });

    it('should handle arrays equality correctly', () => {
        const sources: ScoredTrackData[] = [
            {
                data: {
                    artists: ['Artist A', 'Artist B'],
                    filePath,
                },
                confidence: 0.5,
                source: 'tags',
            },
            {
                data: {
                    artists: ['Artist A', 'Artist B'], // Same array
                    filePath,
                },
                confidence: 0.8,
                source: 'musicbrainz',
            },
        ];

        const { merged, conflicts } = mergeTrackData(sources);

        expect(merged.artists).toEqual(['Artist A', 'Artist B']);
        expect(conflicts.length).toBe(0); // No conflict for identical arrays
    });
});
