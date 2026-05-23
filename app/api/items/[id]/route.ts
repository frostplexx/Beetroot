import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/music/database/db';
import {
    getItemById,
    deleteItemFromDB,
    checkAndUpdateAlbumMissingStatus,
    getAlbumById,
} from '@/lib/music/database';
import * as fs from 'fs';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/items/[id]
 * Body: { album_id?: number }
 *
 * Currently supports moving the item to a different album. The previous
 * album's missing-state is refreshed, and the new album's missing-state too,
 * so empty albums collapse correctly.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const itemId = parseInt(id, 10);
    if (Number.isNaN(itemId)) {
        return NextResponse.json({ error: 'Invalid item id' }, { status: 400 });
    }

    const item = getItemById(itemId);
    if (!item) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    let body: { album_id?: number };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (typeof body.album_id !== 'number' || Number.isNaN(body.album_id)) {
        return NextResponse.json(
            { error: 'album_id (number) is required' },
            { status: 400 }
        );
    }

    if (body.album_id === item.album_id) {
        return NextResponse.json({ item, moved: false });
    }

    const targetAlbum = getAlbumById(body.album_id);
    if (!targetAlbum) {
        return NextResponse.json({ error: 'Target album not found' }, { status: 404 });
    }

    const previousAlbumId = item.album_id;

    db.transaction(() => {
        db.prepare('UPDATE items SET album_id = ? WHERE id = ?').run(body.album_id, itemId);
        if (previousAlbumId !== null) {
            checkAndUpdateAlbumMissingStatus(previousAlbumId);
        }
        checkAndUpdateAlbumMissingStatus(body.album_id!);
    })();

    return NextResponse.json({
        item: getItemById(itemId),
        previousAlbumId,
        moved: true,
    });
}

/**
 * DELETE /api/items/[id]
 * Query: ?deleteFile=true to also unlink the file from disk
 *
 * Removes the item row. The associated album's missing-state is refreshed
 * after deletion so empty albums propagate their missing status correctly.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const itemId = parseInt(id, 10);
    if (Number.isNaN(itemId)) {
        return NextResponse.json({ error: 'Invalid item id' }, { status: 400 });
    }

    const item = getItemById(itemId);
    if (!item) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const deleteFile = request.nextUrl.searchParams.get('deleteFile') === 'true';
    const previousAlbumId = item.album_id;

    if (deleteFile) {
        try {
            if (fs.existsSync(item.path)) {
                fs.unlinkSync(item.path);
            }
        } catch (err) {
            return NextResponse.json(
                {
                    error: `Failed to delete file: ${err instanceof Error ? err.message : String(err)}`,
                },
                { status: 500 }
            );
        }
    }

    deleteItemFromDB(itemId);
    if (previousAlbumId !== null) {
        checkAndUpdateAlbumMissingStatus(previousAlbumId);
    }

    return NextResponse.json({ deleted: true, fileDeleted: deleteFile });
}
