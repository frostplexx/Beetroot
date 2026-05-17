/**
 * Example usage of the TrackRepository
 *
 * This file demonstrates how to use the repository pattern for importing,
 * syncing, and managing music metadata.
 */

import { TrackRepository } from './index';
import db from '../database/db';

async function examples() {
    const repository = new TrackRepository(db);

    // ============================================================================
    // Example 1: Import a new track with MusicBrainz enrichment
    // ============================================================================
    console.log('Example 1: Import track with enrichment');

    const { trackId, conflicts } = await repository.importTrack('/music/song.mp3', {
        skipMusicBrainz: false,  // Fetch MusicBrainz data
        skipLastFm: false,        // Fetch Last.fm genres
        writeBack: 'never',       // Don't write back to file
        conflictResolution: 'keep-db'  // Prefer database on conflicts
    });

    console.log(`Imported track ID: ${trackId}`);
    console.log(`Conflicts detected: ${conflicts.length}`);

    // ============================================================================
    // Example 2: Import without external services (tags only)
    // ============================================================================
    console.log('\nExample 2: Import with tags only');

    const { trackId: trackId2 } = await repository.importTrack('/music/another.mp3', {
        skipMusicBrainz: true,   // Skip MusicBrainz
        skipLastFm: true,         // Skip Last.fm
        writeBack: 'never',
        conflictResolution: 'keep-file'  // Prefer file tags on conflicts
    });

    console.log(`Imported track ID: ${trackId2}`);

    // ============================================================================
    // Example 3: Sync an existing track with its file
    // ============================================================================
    console.log('\nExample 3: Sync track with file');

    const syncResult = await repository.syncTrackById(trackId);

    switch (syncResult.status) {
        case 'ok':
            console.log('Track is in sync');
            break;
        case 'updated':
            console.log('Track updated:', syncResult.updated);
            break;
        case 'conflict':
            console.log('Conflicts detected:', syncResult.conflicts);
            break;
        case 'missing':
            console.log('File is missing');
            break;
    }

    // ============================================================================
    // Example 4: Handle conflicts
    // ============================================================================
    console.log('\nExample 4: Resolve conflicts');

    const trackConflicts = repository.getConflicts(trackId);

    for (const conflict of trackConflicts) {
        console.log(`\nConflict in field: ${conflict.field}`);
        console.log(`  Database value: ${JSON.stringify(conflict.dbValue)} (${conflict.dbSource})`);
        console.log(`  File value: ${JSON.stringify(conflict.fileValue)}`);
        if (conflict.mbValue) {
            console.log(`  MusicBrainz value: ${JSON.stringify(conflict.mbValue)}`);
        }

        // Resolve conflict by keeping file value
        // repository.resolveConflict(conflict.id, 'file');

        // Or keep database value
        // repository.resolveConflict(conflict.id, 'db');

        // Or keep MusicBrainz value
        // repository.resolveConflict(conflict.id, 'mb');

        // Or provide custom value
        // repository.resolveConflict(conflict.id, 'custom', 'My Custom Value');
    }

    // ============================================================================
    // Example 5: Mark file as missing (soft delete)
    // ============================================================================
    console.log('\nExample 5: Mark missing file');

    // When a file is deleted but you want to keep the metadata
    repository.markMissing(trackId);
    console.log(`Track ${trackId} marked as missing`);

    // ============================================================================
    // Example 6: Import with write-back enabled
    // ============================================================================
    console.log('\nExample 6: Import with write-back');

    const { trackId: trackId3 } = await repository.importTrack('/music/third.mp3', {
        skipMusicBrainz: false,
        skipLastFm: false,
        writeBack: 'always',  // Write merged metadata back to file
        conflictResolution: 'keep-mb'  // Prefer MusicBrainz on conflicts
    });

    console.log(`Imported track ID: ${trackId3} with write-back`);

    // ============================================================================
    // Example 7: Batch import
    // ============================================================================
    console.log('\nExample 7: Batch import');

    const files = [
        '/music/track1.mp3',
        '/music/track2.mp3',
        '/music/track3.mp3',
    ];

    for (const file of files) {
        try {
            const result = await repository.importTrack(file, {
                skipMusicBrainz: false,
                skipLastFm: true,
                writeBack: 'never',
                conflictResolution: 'keep-db'
            });
            console.log(`✓ Imported ${file} -> Track ID ${result.trackId}`);
        } catch (error) {
            console.error(`✗ Failed to import ${file}:`, error);
        }
    }

    // ============================================================================
    // Example 8: Fetch album art for existing track
    // ============================================================================
    console.log('\nExample 8: Fetch album art');

    const coverPath = await repository.fetchAlbumArtForTrack(trackId);
    if (coverPath) {
        console.log(`✓ Album art saved to ${coverPath}`);
    } else {
        console.log('✗ No album art found');
    }

    // ============================================================================
    // Example 9: Manual album art fetch with custom options
    // ============================================================================
    console.log('\nExample 9: Manual album art with options');

    const { albumArtManager } = await import('./albumart');

    const art = await albumArtManager.fetchAlbumArt(
        {
            filePath: '/music/track.mp3',
            releaseId: 'mb-release-id',
            artist: 'Pink Floyd',
            album: 'The Dark Side of the Moon'
        },
        {
            preferredSources: ['spotify', 'itunes', 'coverartarchive', 'embedded'],
            minWidth: 600,
            minHeight: 600
        }
    );

    if (art) {
        console.log(`Found ${art.width}x${art.height} from ${art.source}`);
        const savedPath = await albumArtManager.saveAlbumArt(art, '/music/album');
        console.log(`Saved to ${savedPath}`);
    }
}

// Run examples
if (require.main === module) {
    examples().catch(console.error);
}

export { examples };
