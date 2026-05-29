import { createFileRoute } from "@tanstack/react-router";
import db from "@/lib/music/database/db";
import {
    getItemById,
    deleteItemFromDB,
    checkAndUpdateAlbumMissingStatus,
    getAlbumById,
    updateItem,
} from "@/lib/music/database";
import { writeBackItem, moveFile } from "@/lib/music/repository/writeback";
import { globalConfig } from "@/lib/config";
import * as fs from "fs";
import * as path from "path";

function deleteAlbumIfEmpty(albumId: number): boolean {
    const row = db
        .prepare("SELECT COUNT(*) AS c FROM items WHERE album_id = ?")
        .get(albumId) as { c: number };
    if (row.c > 0) return false;
    db.prepare("DELETE FROM albums WHERE id = ?").run(albumId);
    return true;
}

interface UpdateItemPayload {
    album_id?: number;
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
                            body.album_id,
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
                    writeBackItem(updatedItem, writebackMode);
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

            DELETE: async ({ request, params }) => {
                const itemId = parseInt(params.id, 10);
                if (Number.isNaN(itemId)) {
                    return Response.json({ error: "Invalid item id" }, { status: 400 });
                }
                const item = getItemById(itemId);
                if (!item) {
                    return Response.json({ error: "Item not found" }, { status: 404 });
                }
                const { searchParams } = new URL(request.url);
                const deleteFile = searchParams.get("deleteFile") === "true";
                const previousAlbumId = item.album_id;

                if (deleteFile) {
                    if (fs.existsSync(item.path)) {
                        const trashDir = globalConfig.trash_directory
                            ? globalConfig.trash_directory
                            : path.join(globalConfig.music_directory, ".trash") + path.sep;
                        const trashPath = item.path.replace(globalConfig.music_directory, trashDir);
                        if (!moveFile(item.path, trashPath)) {
                            return Response.json(
                                { error: `Failed to move file to trash: ${item.path}` },
                                { status: 500 },
                            );
                        }
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

                return Response.json({
                    deleted: true,
                    fileDeleted: deleteFile,
                    previousAlbumId,
                    previousAlbumDeleted,
                });
            },
        },
    },
});
