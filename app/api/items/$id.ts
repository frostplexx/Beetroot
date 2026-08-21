import { createFileRoute } from "@tanstack/react-router";
import db from "@/lib/music/database/db";
import {
    getItemById,
    unsafeForceDeleteItemFromDB,
    checkAndUpdateAlbumMissingStatus,
    getAlbumById,
    updateItem,
    setAlbumMarkedForDeletion,
} from "@/lib/music/database";
import { writeBackItem } from "@/lib/music/repository/writeback";
import Repository from "@/lib/music/repository";
import { globalConfig } from "@/lib/config";
import * as fs from "fs";

function deleteAlbumIfEmpty(albumId: number): boolean {
    const row = db
        .prepare("SELECT COUNT(*) AS c FROM items WHERE album_id = ?")
        .get(albumId) as { c: number };
    if (row.c > 0) return false;
    db.prepare("DELETE FROM albums WHERE id = ?").run(albumId);
    return true;
}

// If every remaining item in the album is soft-deleted, soft-delete the album row
// too so the now-empty album doesn't keep showing up in listings.
function syncAlbumDeletionFromItems(albumId: number): boolean {
    const row = db.prepare(`
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN marked_for_deletion IS NOT NULL THEN 1 ELSE 0 END) AS deleted
        FROM items
        WHERE album_id = ?
    `).get(albumId) as { total: number; deleted: number };
    if (row.total > 0 && row.total === row.deleted) {
        setAlbumMarkedForDeletion(albumId, Date.now());
        return true;
    }
    return false;
}

interface UpdateItemPayload {
    album_id?: number;
    title?: string;
    artist?: string;
    artists?: string;
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

export const Route = createFileRoute("/api/items/$id")({
    server: {
        handlers: {
            PATCH: async ({ request, params }) => {
                const itemId = parseInt(params.id, 10);
                if (Number.isNaN(itemId)) {
                    return Response.json({ error: "Invalid item id" }, { status: 400 });
                }
                const item = getItemById(itemId);
                if (!item) {
                    return Response.json({ error: "Item not found" }, { status: 404 });
                }

                let body: UpdateItemPayload;
                try {
                    body = await request.json();
                } catch {
                    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
                }

                if (body.album_id !== undefined) {
                    if (typeof body.album_id !== "number" || Number.isNaN(body.album_id)) {
                        return Response.json(
                            { error: "album_id must be a number" },
                            { status: 400 },
                        );
                    }
                    if (body.album_id === item.album_id) {
                        return Response.json({ item, moved: false });
                    }
                    const targetAlbum = getAlbumById(body.album_id);
                    if (!targetAlbum) {
                        return Response.json(
                            { error: "Target album not found" },
                            { status: 404 },
                        );
                    }
                    const previousAlbumId = item.album_id;
                    let previousAlbumDeleted = false;
                    db.transaction(() => {
                        db.prepare("UPDATE items SET album_id = ? WHERE id = ?").run(
                            body.album_id!,
                            itemId,
                        );
                        if (previousAlbumId !== null) {
                            previousAlbumDeleted = deleteAlbumIfEmpty(previousAlbumId);
                            if (!previousAlbumDeleted) {
                                checkAndUpdateAlbumMissingStatus(previousAlbumId);
                            }
                        }
                        checkAndUpdateAlbumMissingStatus(body.album_id!);
                    })();
                    return Response.json({
                        item: getItemById(itemId),
                        previousAlbumId,
                        previousAlbumDeleted,
                        moved: true,
                    });
                }

                const updates: Partial<typeof item> = {};
                if (body.title !== undefined) updates.title = body.title.trim();
                if (body.artist !== undefined) updates.artist = body.artist.trim();
                // Stored comma-joined; normalise so writeback splits it back cleanly.
                if (body.artists !== undefined) {
                    updates.artists = body.artists.trim()
                        ? body.artists
                              .split(",")
                              .map((a) => a.trim())
                              .filter(Boolean)
                              .join(", ")
                        : null;
                }
                if (body.albumartist !== undefined)
                    updates.albumartist = body.albumartist.trim() || null;
                if (body.composers !== undefined)
                    updates.composers = body.composers.trim() || null;
                if (body.track !== undefined) updates.track = body.track || null;
                if (body.disc !== undefined) updates.disc = body.disc || null;
                if (body.bpm !== undefined) updates.bpm = body.bpm || null;
                if (body.isrc !== undefined) updates.isrc = body.isrc.trim() || null;
                if (body.comments !== undefined)
                    updates.comments = body.comments.trim() || null;
                if (body.lyrics !== undefined) updates.lyrics = body.lyrics.trim() || null;
                if (body.year !== undefined) updates.year = body.year || null;
                if (body.original_year !== undefined)
                    updates.original_year = body.original_year || null;
                if (body.genre !== undefined) {
                    updates.genres = body.genre.trim()
                        ? body.genre
                              .split(",")
                              .map((g) => g.trim())
                              .filter(Boolean)
                        : null;
                }

                if (Object.keys(updates).length === 0) {
                    return Response.json({ item, updated: false });
                }

                const updatedItem = { ...item, ...updates };
                updateItem(itemId, updates);

                const writebackMode = globalConfig.writeback_mode || "missing-only";
                try {
                    await writeBackItem(updatedItem, writebackMode);
                } catch (error) {
                    console.error(`Failed to write back to ${updatedItem.path}:`, error);
                    return Response.json(
                        {
                            error: "Database updated but writeback failed",
                            details: error instanceof Error ? error.message : "Unknown error",
                            item: getItemById(itemId),
                        },
                        { status: 500 },
                    );
                }

                return Response.json({
                    item: getItemById(itemId),
                    updated: true,
                    fieldsUpdated: Object.keys(updates),
                });
            },

            DELETE: async ({ params }) => {
                const itemId = parseInt(params.id, 10);
                if (Number.isNaN(itemId)) {
                    return Response.json({ error: "Invalid item id" }, { status: 400 });
                }
                const item = getItemById(itemId);
                if (!item || item.marked_for_deletion != null) {
                    return Response.json({ error: "Item not found" }, { status: 404 });
                }
                const previousAlbumId = item.album_id;

                // Mode decided by file presence, not by caller: a present file
                // becomes a soft-delete (restorable); an already-missing file is
                // a permanent DB delete since there's nothing on disk to move.
                if (fs.existsSync(item.path)) {
                    try {
                        Repository.markItemForDeletion(item);
                    } catch (err) {
                        return Response.json(
                            { error: err instanceof Error ? err.message : String(err) },
                            { status: 500 },
                        );
                    }
                    let previousAlbumDeleted = false;
                    if (previousAlbumId !== null) {
                        previousAlbumDeleted = syncAlbumDeletionFromItems(previousAlbumId);
                    }
                    return Response.json({
                        deleted: true,
                        mode: "soft",
                        previousAlbumId,
                        previousAlbumDeleted,
                    });
                }

                // File already gone on disk; the on-disk verification we just
                // did is equivalent to the missing_since invariant, so use the
                // unsafe path with a clear audit reason instead of writing
                // missing_since just to re-read it inside deleteItemFromDB.
                unsafeForceDeleteItemFromDB(itemId, `API item DELETE: file already missing at ${item.path}`);
                let previousAlbumDeleted = false;
                if (previousAlbumId !== null) {
                    previousAlbumDeleted = deleteAlbumIfEmpty(previousAlbumId);
                    if (!previousAlbumDeleted) {
                        previousAlbumDeleted = syncAlbumDeletionFromItems(previousAlbumId);
                    }
                    if (!previousAlbumDeleted) {
                        checkAndUpdateAlbumMissingStatus(previousAlbumId);
                    }
                }
                return Response.json({
                    deleted: true,
                    mode: "permanent",
                    previousAlbumId,
                    previousAlbumDeleted,
                });
            },
        },
    },
});
