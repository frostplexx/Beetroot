import { NextResponse } from 'next/server';
import db from '@/lib/music/database/db';

interface MissingFile {
    id: number;
    path: string;
    title: string | null;
    artist: string | null;
    album: string | null;
    missingSince: number;
}

/**
 * GET /api/missing-files
 * Get list of all missing files with metadata
 */
export async function GET() {
    try {
        const missingFiles = db.prepare(`
            SELECT
                id,
                path,
                title,
                artist,
                album,
                missing_since as missingSince
            FROM items
            WHERE missing_since IS NOT NULL
            ORDER BY missing_since DESC
        `).all() as MissingFile[];

        return NextResponse.json({
            success: true,
            count: missingFiles.length,
            files: missingFiles
        });
    } catch (error) {
        console.error('Failed to fetch missing files:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch missing files' },
            { status: 500 }
        );
    }
}
