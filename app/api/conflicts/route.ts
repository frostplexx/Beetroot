import { NextRequest, NextResponse } from 'next/server';
// import { TrackRepository } from '@/lib/music/repository';
import db from '@/lib/music/database/db';

// TODO: Re-implement TrackRepository or refactor these routes
// const repository = new TrackRepository(db);

/**
 * GET /api/conflicts?trackId=123
 * Get conflicts for a specific track or all conflicts
 */
export async function GET(request: NextRequest) {
    try {
        const trackId = request.nextUrl.searchParams.get('trackId');

        if (trackId) {
            // TODO: Implement getConflicts
            // const conflicts = repository.getConflicts(parseInt(trackId));
            return NextResponse.json({ success: true, conflicts: [] });
        }

        // Get all conflicts
        const allConflicts = db.prepare(`
            SELECT
                c.*,
                i.title as track_title,
                i.artist as track_artist,
                i.album as track_album
            FROM sync_conflicts c
            JOIN items i ON c.track_id = i.id
            ORDER BY c.timestamp DESC
        `).all();

        return NextResponse.json({ success: true, conflicts: allConflicts });
    } catch (error) {
        console.error('Get conflicts error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to get conflicts' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/conflicts
 * Resolve a conflict
 * Body: { conflictId: number, resolution: 'db' | 'file' | 'mb' | 'custom', customValue?: any }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (!body.conflictId || !body.resolution) {
            return NextResponse.json(
                { error: 'Missing conflictId or resolution' },
                { status: 400 }
            );
        }

        // TODO: Implement resolveConflict
        // repository.resolveConflict(
        //     body.conflictId,
        //     body.resolution,
        //     body.customValue
        // );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Resolve conflict error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to resolve conflict' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/conflicts?trackId=123
 * Clear all conflicts for a track
 */
export async function DELETE(request: NextRequest) {
    try {
        const trackId = request.nextUrl.searchParams.get('trackId');

        if (!trackId) {
            return NextResponse.json(
                { error: 'Missing trackId' },
                { status: 400 }
            );
        }

        db.prepare('DELETE FROM sync_conflicts WHERE track_id = ?').run(parseInt(trackId));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete conflicts error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete conflicts' },
            { status: 500 }
        );
    }
}
