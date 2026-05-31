import { createFileRoute } from "@tanstack/react-router";
import db from "@/lib/music/database/db";

interface TrashedAlbum {
    id: number;
    album: string;
    albumartist: string;
    year: number | null;
    artpath: string | null;
    marked_for_deletion: number;
    itemCount: number;
}

interface TrashedItem {
    id: number;
    title: string | null;
    artist: string | null;
    album: string | null;
    album_id: number | null;
    path: string;
    marked_for_deletion: number;
}

export const Route = createFileRoute("/api/admin/trash")({
    server: {
        handlers: {
            GET: async () => {
                try {
                    const albums = db
                        .prepare(
                            `
                        SELECT a.id, a.album, a.albumartist, a.year, a.artpath, a.marked_for_deletion,
                               (SELECT COUNT(*) FROM items
                                  WHERE album_id = a.id AND marked_for_deletion IS NOT NULL) AS itemCount
                        FROM albums a
                        WHERE a.marked_for_deletion IS NOT NULL
                        ORDER BY a.marked_for_deletion DESC
                        `,
                        )
                        .all() as TrashedAlbum[];

                    const items = db
                        .prepare(
                            `
                        SELECT i.id, i.title, i.artist, i.album, i.album_id, i.path, i.marked_for_deletion
                        FROM items i
                        LEFT JOIN albums a ON a.id = i.album_id
                        WHERE i.marked_for_deletion IS NOT NULL
                          AND (a.id IS NULL OR a.marked_for_deletion IS NULL)
                        ORDER BY i.marked_for_deletion DESC
                        `,
                        )
                        .all() as TrashedItem[];

                    return Response.json({ albums, items });
                } catch (error) {
                    console.error("Error fetching trash:", error);
                    return Response.json(
                        { error: "Failed to fetch trash" },
                        { status: 500 },
                    );
                }
            },
        },
    },
});
