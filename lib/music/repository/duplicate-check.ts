import { parseFile } from 'music-metadata';
import { globalConfig } from '../../config';
import db from '../database/db';
import { computeFileHash } from '../utils/hash';

/**
 * Quick duplicate check before expensive metadata fetching
 * Reads only mb_trackid from local tags and checks database
 */
export async function checkForDuplicate(filePath: string): Promise<boolean> {
    try {
        // Skip duplicate check if using path-only detection
        if (globalConfig.duplicate_detection === 'path') {
            return false;
        }

        // If using mb_trackid detection, read just that tag
        if (globalConfig.duplicate_detection === 'mb_trackid' || globalConfig.duplicate_detection === 'file_hash') {
            const metadata = await parseFile(filePath, { skipCovers: true });
            const mb_trackid = metadata.common.musicbrainz_recordingid;

            if (mb_trackid) {
                const existing = db.prepare('SELECT id FROM items WHERE mb_trackid = ? AND mb_trackid IS NOT NULL')
                    .get(mb_trackid) as { id: number } | undefined;

                if (existing) {
                    console.debug(`Duplicate: ${filePath} (mb_trackid: ${mb_trackid}, existing id: ${existing.id})`);
                    return true;
                }
            }
        }

        // If using file_hash detection and compute_file_hash is enabled
        if (globalConfig.duplicate_detection === 'file_hash' && globalConfig.compute_file_hash) {
            // Use streaming hash to avoid loading entire file into memory
            const hash = await computeFileHash(filePath);

            const existing = db.prepare('SELECT id FROM items WHERE file_hash = ? AND file_hash IS NOT NULL')
                .get(hash) as { id: number } | undefined;

            if (existing) {
                console.debug(`Duplicate: ${filePath} (file_hash: ${hash}, existing id: ${existing.id})`);
                return true;
            }
        }

        return false;
    } catch (error) {
        // If we can't read metadata, don't skip the file
        console.debug(`Duplicate check failed for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}
