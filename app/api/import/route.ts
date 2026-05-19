import { NextRequest, NextResponse } from 'next/server';
// import { TrackRepository } from '@/lib/music/repository';
import db from '@/lib/music/database/db';
import * as fs from 'fs';
import * as path from 'path';
import { globalConfig } from '@/lib/config';
// import { expandPath } from '@/lib/music/repository/utils';

// TODO: Re-implement TrackRepository or refactor these routes
// const repository = new TrackRepository(db);

function expandPath(p: string): string {
    return p.replace(/^~/, process.env.HOME || '~');
}

/**
 * POST /api/import
 * Import a single track or batch of tracks
 * Body: { filePath: string } | { filePaths: string[] }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Single file import
        if (body.filePath) {
            // TODO: Implement importTrack
            // const result = await repository.importTrack(body.filePath, {
            //     skipMusicBrainz: body.skipMusicBrainz || false,
            //     skipLastFm: body.skipLastFm || false,
            //     writeBack: body.writeBack || 'missing-only',
            //     conflictResolution: body.conflictResolution || 'keep-db',
            //     organizeFiles: body.organizeFiles || false
            // });

            return NextResponse.json({
                success: false,
                error: 'Import functionality not yet implemented',
            }, { status: 501 });
        }

        // Batch import
        if (body.filePaths && Array.isArray(body.filePaths)) {
            // TODO: Implement batch import
            return NextResponse.json({
                success: false,
                error: 'Batch import functionality not yet implemented',
            }, { status: 501 });
        }

        return NextResponse.json(
            { error: 'Missing filePath or filePaths' },
            { status: 400 }
        );
    } catch (error) {
        console.error('Import error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Import failed' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/import?scan=true
 * Scan music directory for new files
 */
export async function GET(request: NextRequest) {
    try {
        const scan = request.nextUrl.searchParams.get('scan');

        if (scan === 'true') {
            const musicDir = globalConfig.music_directory;

            if (!musicDir) {
                return NextResponse.json(
                    { error: 'Music directory not configured in config.yaml' },
                    { status: 400 }
                );
            }

            // Expand ~ and resolve path
            const expandedDir = expandPath(musicDir);

            if (!fs.existsSync(expandedDir)) {
                return NextResponse.json(
                    {
                        error: `Music directory not found: ${expandedDir}`,
                        configured: musicDir,
                        expanded: expandedDir
                    },
                    { status: 400 }
                );
            }

            // Find all audio files
            const audioFiles = await findAudioFiles(expandedDir);

            // Check which are new
            const newFiles: string[] = [];
            const existingFiles: string[] = [];

            for (const file of audioFiles) {
                const existing = db.prepare('SELECT id FROM items WHERE path = ?').get(file) as any;
                if (existing) {
                    existingFiles.push(file);
                } else {
                    newFiles.push(file);
                }
            }

            return NextResponse.json({
                success: true,
                total: audioFiles.length,
                new: newFiles.length,
                existing: existingFiles.length,
                newFiles: newFiles.slice(0, 100) // Return first 100 for preview
            });
        }

        return NextResponse.json({ error: 'Missing scan parameter' }, { status: 400 });
    } catch (error) {
        console.error('Scan error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Scan failed' },
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
