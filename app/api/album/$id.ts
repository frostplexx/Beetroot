import { createFileRoute } from "@tanstack/react-router";
import { getAlbumById, updateAlbumFields } from "@/lib/music/database/albums";
import { getItemsByAlbum, batchUpdateItems } from "@/lib/music/database/items";
import { writeBackItem } from "@/lib/music/repository/writeback";
import { globalConfig } from "@/lib/config";
import Repository from "@/lib/music/repository";
import db from "@/lib/music/database/db";
import * as path from "path";
import * as fs from "fs/promises";

interface UpdateAlbumPayload {
    album: string;
    albumartist: string;
    year?: string;
    country?: string;
    label?: string;
    genres?: string;
    image?: string;
}

export const Route = createFileRoute("/api/album/$id")({
    server: {
        handlers: {
            PATCH: async ({ request, params }) => {
                try {
                    const albumId = parseInt(params.id, 10);
                    if (!Number.isFinite(albumId) || albumId <= 0) {
                        return Response.json({ error: "Invalid album ID" }, { status: 400 });
                    }

                    const album = getAlbumById(albumId);
                    if (!album) {
                        return Response.json({ error: "Album not found" }, { status: 404 });
                    }

                    const payload: UpdateAlbumPayload = await request.json();

                    if (!payload.album?.trim() || !payload.albumartist?.trim()) {
                        return Response.json(
                            { error: "Album name and artist are required" },
                            { status: 400 },
                        );
                    }

                    if (payload.year) {
                        const year = parseInt(payload.year, 10);
                        if (
                            !Number.isFinite(year) ||
                            year < 1000 ||
                            year > new Date().getFullYear() + 10
                        ) {
                            return Response.json({ error: "Invalid year" }, { status: 400 });
                        }
                    }

                    album.album = payload.album.trim();
                    album.albumartist = payload.albumartist.trim();
                    album.year = payload.year ? parseInt(payload.year, 10) : null;
                    album.country = payload.country?.trim() || null;
                    album.label = payload.label?.trim() || null;
                    album.genres = payload.genres?.trim() || null;

                    const items = getItemsByAlbum(albumId);

                    if (payload.image && payload.image.startsWith("http")) {
                        try {
                            const response = await fetch(payload.image);
                            if (!response.ok) {
                                throw new Error(`Failed to download image: ${response.status}`);
                            }
                            const contentType = response.headers.get("content-type");
                            if (!contentType?.startsWith("image/")) {
                                throw new Error("URL does not point to an image");
                            }
                            const arrayBuffer = await response.arrayBuffer();
                            const imageBuffer = Buffer.from(arrayBuffer);
                            if (imageBuffer.length > 10 * 1024 * 1024) {
                                throw new Error("Image too large (max 10MB)");
                            }
                            if (items.length === 0) {
                                throw new Error("No tracks found for album");
                            }
                            const albumDir = path.dirname(items[0].path);
                            const coverPath = path.join(albumDir, "cover.jpg");
                            await fs.writeFile(coverPath, imageBuffer);
                            album.artpath = coverPath;
                            console.log(`Cover art saved to ${coverPath}`);
                        } catch (error) {
                            console.error("Error downloading cover art:", error);
                        }
                    }

                    updateAlbumFields(album.id, {
                        album: album.album,
                        albumartist: album.albumartist,
                        year: album.year,
                        country: album.country,
                        label: album.label,
                        genres: album.genres,
                        artpath: album.artpath,
                    });

                    if (items.length > 0) {
                        const updates = items.map((item) => ({
                            id: item.id,
                            fields: {
                                album: album.album,
                                albumartist: album.albumartist,
                                year: album.year,
                                country: album.country,
                                label: album.label,
                                genres: album.genres ? album.genres.split(",").map(g => g.trim()) : null,
                            },
                        }));

                        batchUpdateItems(updates);

                        const writebackMode = globalConfig.writeback_mode || "missing-only";
                        let successCount = 0;
                        let errorCount = 0;

                        for (const item of items) {
                            item.album = album.album;
                            item.albumartist = album.albumartist;
                            item.year = album.year;
                            item.country = album.country;
                            item.label = album.label;

                            if (album.genres) {
                                item.genres = album.genres
                                    .split(",")
                                    .map((g) => g.trim());
                            } else {
                                item.genres = null;
                            }

                            try {
                                await writeBackItem(item, writebackMode);
                                successCount++;
                            } catch (error) {
                                console.error(`Failed to write back to ${item.path}:`, error);
                                errorCount++;
                            }
                        }

                        console.log(
                            `Writeback complete: ${successCount} succeeded, ${errorCount} failed`,
                        );
                    }

                    return Response.json({
                        success: true,
                        albumId,
                        tracksUpdated: items.length,
                    });
                } catch (error) {
                    console.error("Error updating album:", error);
                    return Response.json(
                        {
                            error: "Failed to update album",
                            details: error instanceof Error ? error.message : "Unknown error",
                        },
                        { status: 500 },
                    );
                }
            },

            DELETE: async ({ params }) => {
                try {
                    const albumId = parseInt(params.id, 10);
                    if (!Number.isFinite(albumId) || albumId <= 0) {
                        return Response.json({ error: "Invalid album ID" }, { status: 400 });
                    }
                    const album = getAlbumById(albumId);
                    if (!album || album.marked_for_deletion != null) {
                        return Response.json({ error: "Album not found" }, { status: 404 });
                    }

                    // Two distinct delete modes, picked from existing album state — the
                    // caller doesn't get to choose between them, which keeps the
                    // dangerous one off-limits unless the data is already lost on disk.
                    //
                    //   missing on disk → permanent: nothing to move to trash, so the
                    //     DB rows can be removed in a single transaction.
                    //   present on disk → soft delete: files move to trash, items and
                    //     the album row keep a marked_for_deletion timestamp. The user
                    //     can restore via the restore endpoint up to delete_after days
                    //     later, after which the reconcile cleanup reaps them.
                    if (album.missing_since != null) {
                        // Defense in depth: the album-level missing flag isn't enough —
                        // verify every item is also missing before any DELETE runs. If
                        // even one item still has files on disk, bail out instead of
                        // hard-deleting recoverable data.
                        const presence = db.prepare(`
                            SELECT COUNT(*) AS c FROM items
                            WHERE album_id = ? AND missing_since IS NULL AND marked_for_deletion IS NULL
                        `).get(albumId) as { c: number };
                        if (presence.c > 0) {
                            return Response.json({
                                error: `Album ${albumId} has ${presence.c} live item(s); refusing permanent delete. Soft-delete instead.`,
                            }, { status: 409 });
                        }
                        const result = db.transaction(() => {
                            const itemRes = db
                                .prepare("DELETE FROM items WHERE album_id = ?")
                                .run(albumId);
                            const albRes = db
                                .prepare("DELETE FROM albums WHERE id = ?")
                                .run(albumId);
                            return {
                                itemsDeleted: Number(itemRes.changes),
                                albumDeleted: Number(albRes.changes) > 0,
                            };
                        })();
                        return Response.json({ deleted: true, mode: "permanent", albumId, ...result });
                    }

                    const result = Repository.markAlbumForDeletion(albumId);
                    return Response.json({
                        deleted: true,
                        mode: "soft",
                        albumId,
                        itemsMoved: result.itemsMoved,
                    });
                } catch (error) {
                    console.error("Error deleting album:", error);
                    return Response.json(
                        {
                            error: "Failed to delete album",
                            details: error instanceof Error ? error.message : "Unknown error",
                        },
                        { status: 500 },
                    );
                }
            },
        },
    },
});
