import { NextRequest, NextResponse } from 'next/server';
import { TrackRepository } from '@/lib/music/repository';
import db from '@/lib/music/database/db';
import * as fs from 'fs';
import * as path from 'path';
import { globalConfig } from '@/lib/config';
import { expandPath } from '@/lib/music/repository/utils';

const repository = new TrackRepository(db);

/**
 * GET /api/reconcile?status=true
 * Get reconcile status (what needs to be synced)
 */
export async function GET(request: NextRequest) {
    try {
        const status = request.nextUrl.searchParams.get('status');

        if (status === 'true') {
            // Quick check: count files that need processing
            const musicDir = expandPath(globalConfig.music_directory);

            if (!fs.existsSync(musicDir)) {
                return NextResponse.json({
                    needsSync: 0,
                    newFiles: 0,
                    missingFiles: 0
                });
            }

            // Find all audio files
            const audioFiles = await findAudioFiles(musicDir);

            // Check which are new
            let newCount = 0;
            for (const file of audioFiles) {
                const existing = db.prepare('SELECT id FROM items WHERE path = ?').get(file);
                if (!existing) {
                    newCount++;
                }
            }

            // Check for missing files (files in DB but not on disk)
            // Include both unmarked and already-marked missing files
            const dbFiles = db.prepare('SELECT id, path, missing_since FROM items').all() as Array<{ id: number, path: string, missing_since: number | null }>;
            let missingCount = 0;
            let alreadyMarkedMissing = 0;

            for (const dbFile of dbFiles) {
                if (!fs.existsSync(dbFile.path)) {
                    if (dbFile.missing_since === null) {
                        missingCount++; // Need to mark as missing
                    } else {
                        alreadyMarkedMissing++; // Already marked
                    }
                }
            }

            return NextResponse.json({
                needsSync: newCount + missingCount,
                newFiles: newCount,
                missingFiles: missingCount,
                totalMissing: missingCount + alreadyMarkedMissing
            });
        }

        return NextResponse.json({ error: 'Missing status parameter' }, { status: 400 });
    } catch (error) {
        console.error('Reconcile status error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Status check failed' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/reconcile
 * Remove missing files from database
 */
export async function DELETE() {
    try {
        // Delete all items marked as missing
        const result = db.prepare('DELETE FROM items WHERE missing_since IS NOT NULL').run();

        // Delete albums that have no tracks left
        const emptyAlbums = db.prepare(`
            DELETE FROM albums
            WHERE id NOT IN (SELECT DISTINCT album_id FROM items WHERE album_id IS NOT NULL)
        `).run();

        console.log(`Deleted ${result.changes} missing tracks and ${emptyAlbums.changes} empty albums`);

        return NextResponse.json({
            success: true,
            deleted: result.changes,
            deletedAlbums: emptyAlbums.changes
        });
    } catch (error) {
        console.error('Forget missing files error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Delete failed' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/reconcile
 * Reconcile database with filesystem
 */
export async function POST(request: NextRequest) {
    console.log('\n========== RECONCILE START ==========');
    try {
        const body = await request.json();
        const action = body.action; // 'start' or 'progress'

        if (action === 'start') {
            console.log('Action: start (background mode - not yet implemented)');
            // Return immediately, actual work happens in background
            // Client will poll for progress
            return NextResponse.json({ success: true, message: 'Reconcile started' });
        }

        console.log('Action: full reconcile (foreground mode)');

        // Full reconcile process
        const musicDir = expandPath(globalConfig.music_directory);
        console.log('Music directory:', musicDir);

        if (!fs.existsSync(musicDir)) {
            console.error('✗ Music directory not found:', musicDir);
            return NextResponse.json(
                { error: `Music directory not found: ${musicDir}` },
                { status: 400 }
            );
        }

        const results = {
            scanned: 0,
            imported: 0,
            missing: 0,
            errors: [] as string[]
        };

        // Step 1: Find all audio files
        console.log('\n→ STEP 1: Scanning for audio files...');
        const audioFiles = await findAudioFiles(musicDir);
        results.scanned = audioFiles.length;
        console.log(`  ✓ Found ${audioFiles.length} audio files`);

        // Step 2: Import new files
        console.log('\n→ STEP 2: Importing new files...');
        let newFileCount = 0;
        for (const file of audioFiles) {
            const existing = db.prepare('SELECT id FROM items WHERE path = ?').get(file);
            if (!existing) {
                newFileCount++;
                console.log(`\n  [${newFileCount}] New file: ${file}`);
                try {
                    await repository.importTrack(file, {
                        skipMusicBrainz: false,
                        skipLastFm: false,
                        writeBack: 'missing-only',
                        conflictResolution: 'keep-db',
                        organizeFiles: true
                    });
                    results.imported++;
                    console.log(`  ✓ Successfully imported`);
                } catch (error) {
                    const errorMsg = `Failed to import ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    console.error(`  ✗ ${errorMsg}`);
                    results.errors.push(errorMsg);
                }
            }
        }
        console.log(`\n  Summary: ${results.imported} imported, ${results.errors.length} errors`);

        // Step 3: Mark missing files
        console.log('\n→ STEP 3: Checking for missing files...');
        const dbFiles = db.prepare('SELECT id, path FROM items WHERE missing_since IS NULL').all() as Array<{ id: number, path: string }>;
        console.log(`  Checking ${dbFiles.length} files in database...`);
        for (const dbFile of dbFiles) {
            if (!fs.existsSync(dbFile.path)) {
                console.log(`  ⚠ Missing: ${dbFile.path} (id=${dbFile.id})`);
                repository.markMissing(dbFile.id);
                results.missing++;
            }
        }
        console.log(`  Summary: ${results.missing} files marked as missing`);

        // Step 4: Rebuild albums from tracks
        console.log('\n→ STEP 4: Rebuilding albums...');
        const rebuildResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/albums/rebuild`, {
            method: 'POST'
        });

        if (!rebuildResponse.ok) {
            console.warn('  ⚠ Failed to rebuild albums during reconcile');
        } else {
            console.log('  ✓ Albums rebuilt');
        }

        console.log('\n========== RECONCILE COMPLETE ==========');
        console.log('Summary:', results);
        console.log('=========================================\n');

        return NextResponse.json({
            success: true,
            ...results
        });
    } catch (error) {
        console.error('\n✗ RECONCILE ERROR:', error);
        console.error('Stack:', error instanceof Error ? error.stack : 'no stack');
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Reconcile failed' },
            { status: 500 }
        );
    }
}

/**
 * Recursively find all audio files in a directory
 */
async function findAudioFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const audioExtensions = ['.mp3', '.flac', '.m4a', '.mp4', '.ogg', '.opus'];

    async function walk(currentPath: string) {
        const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);

            if (entry.isDirectory()) {
                // Skip hidden directories
                if (!entry.name.startsWith('.')) {
                    await walk(fullPath);
                }
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (audioExtensions.includes(ext)) {
                    files.push(fullPath);
                }
            }
        }
    }

    await walk(dir);
    return files;
}
