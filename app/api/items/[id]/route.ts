import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/music/database/db';
import {
    getItemById,
    deleteItemFromDB,
    checkAndUpdateAlbumMissingStatus,
    getAlbumById,
    updateItem,
} from '@/lib/music/database';
import { writeBackItem } from '@/lib/music/repository/writeback';
import { globalConfig } from '@/lib/config';
import * as fs from 'fs';

export const dynamic = 'force-dynamic';

/**
 * Drop an album row if it has no remaining items. Returns true if deleted.
 * Used after move/delete to keep the library tidy.
 */
function deleteAlbumIfEmpty(albumId: number): boolean {
    const row = db
        .prepare('SELECT COUNT(*) AS c FROM items WHERE album_id = ?')
        .get(albumId) as { c: number };
    if (row.c > 0) return false;
    db.prepare('DELETE FROM albums WHERE id = ?').run(albumId);
    return true;
}

interface UpdateItemPayload {
    // Album move (legacy)
    album_id?: number;
    // Track metadata fields
    title?: string;
    artist?: string;
    albumartist?: string;
    composers?: string;
    track?: number;
    disc?: number;
    bpm?: number;
    isrc?: string;
    comments?: string;
    lyrics?: string;
    genre?: string;
    year?: number;
    original_year?: number;
}

/**
 * PATCH /api/items/[id]
 * Body: { album_id?, title?, artist?, ... }
 *
 * Supports:
 * - Moving item to a different album (album_id)
 * - Updating track metadata fields (title, artist, composer, BPM, ISRC, lyrics, etc.)
 *
 * Metadata updates are written back to the audio file according to writeback_mode.
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

    let body: UpdateItemPayload;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Handle album move (legacy behavior)
    if (body.album_id !== undefined) {
        if (typeof body.album_id !== 'number' || Number.isNaN(body.album_id)) {
            return NextResponse.json(
                { error: 'album_id must be a number' },
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
        let previousAlbumDeleted = false;

        db.transaction(() => {
            db.prepare('UPDATE items SET album_id = ? WHERE id = ?').run(body.album_id, itemId);
            if (previousAlbumId !== null) {
                previousAlbumDeleted = deleteAlbumIfEmpty(previousAlbumId);
                if (!previousAlbumDeleted) {
                    checkAndUpdateAlbumMissingStatus(previousAlbumId);
                }
            }
            checkAndUpdateAlbumMissingStatus(body.album_id!);
        })();

        return NextResponse.json({
            item: getItemById(itemId),
            previousAlbumId,
            previousAlbumDeleted,
            moved: true,
        });
    }

    // Handle metadata field updates
    const updates: Partial<typeof item> = {};

    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.artist !== undefined) updates.artist = body.artist.trim();
    if (body.albumartist !== undefined) updates.albumartist = body.albumartist.trim() || null;
    if (body.composers !== undefined) updates.composers = body.composers.trim() || null;
    if (body.track !== undefined) updates.track = body.track || null;
    if (body.disc !== undefined) updates.disc = body.disc || null;
    if (body.bpm !== undefined) updates.bpm = body.bpm || null;
    if (body.isrc !== undefined) updates.isrc = body.isrc.trim() || null;
    if (body.comments !== undefined) updates.comments = body.comments.trim() || null;
    if (body.lyrics !== undefined) updates.lyrics = body.lyrics.trim() || null;
    if (body.year !== undefined) updates.year = body.year || null;
    if (body.original_year !== undefined) updates.original_year = body.original_year || null;

    // Handle genre - UI sends single string, DB expects array
    if (body.genre !== undefined) {
        updates.genres = body.genre.trim()
            ? body.genre.split(',').map(g => g.trim()).filter(Boolean)
            : null;
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ item, updated: false });
    }

    // Update database
    const updatedItem = { ...item, ...updates };
    updateItem(itemId, updates);

    // Write back to file
    const writebackMode = globalConfig.writeback_mode || 'missing-only';
    try {
        writeBackItem(updatedItem, writebackMode);
    } catch (error) {
        console.error(`Failed to write back to ${updatedItem.path}:`, error);
        return NextResponse.json(
            {
                error: 'Database updated but writeback failed',
                details: error instanceof Error ? error.message : 'Unknown error',
                item: getItemById(itemId),
            },
            { status: 500 }
        );
    }

    return NextResponse.json({
        item: getItemById(itemId),
        updated: true,
        fieldsUpdated: Object.keys(updates),
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
    let previousAlbumDeleted = false;
    if (previousAlbumId !== null) {
        previousAlbumDeleted = deleteAlbumIfEmpty(previousAlbumId);
        if (!previousAlbumDeleted) {
            checkAndUpdateAlbumMissingStatus(previousAlbumId);
        }
    }

    return NextResponse.json({
        deleted: true,
        fileDeleted: deleteFile,
        previousAlbumId,
        previousAlbumDeleted,
    });
}
