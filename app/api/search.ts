import { createFileRoute } from "@tanstack/react-router";
import { searchAlbums, getAlbumsSearchCount, getAlbumById } from "@/lib/music/database";
import { searchItems } from "@/lib/music/database/items";
import { artVersion, withArtVersion } from "@/lib/api/art-version";

export const Route = createFileRoute("/api/search")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                try {
                    const { searchParams } = new URL(request.url);
                    const query = searchParams.get("q") || "";
                    const page = parseInt(searchParams.get("page") || "0", 10);
                    const pageSize = parseInt(searchParams.get("pageSize") || "10", 10);

                    if (!query.trim()) {
                        return Response.json({
                            albums: [],
                            tracks: [],
                            pagination: { page: 0, pageSize, total: 0, totalPages: 0 },
                        });
                    }

                    const albums = searchAlbums(query, page, pageSize);
                    const total = getAlbumsSearchCount(query);

                    const rawTracks = searchItems(query, 0, 10)
                        .filter((item) => item.album_id != null);

                    // Track results render their album's cover, so they need the
                    // same art version as an album row. Resolved per distinct
                    // album rather than per track.
                    const versionByAlbum = new Map<number, number>();
                    for (const albumId of new Set(rawTracks.map((item) => item.album_id!))) {
                        versionByAlbum.set(albumId, artVersion(getAlbumById(albumId)?.artpath));
                    }

                    const tracks = rawTracks.map((item) => ({
                        id: item.id,
                        title: item.title,
                        artist: item.artist,
                        album: item.album,
                        album_id: item.album_id,
                        track: item.track,
                        year: item.year,
                        added: item.added,
                        art_version: versionByAlbum.get(item.album_id!) ?? 0,
                    }));

                    return Response.json({
                        albums: withArtVersion(albums),
                        tracks,
                        pagination: {
                            page,
                            pageSize,
                            total,
                            totalPages: Math.ceil(total / pageSize),
                        },
                    });
                } catch (error) {
                    console.error("[API] Error searching:", error);
                    return Response.json({ error: "Failed to search" }, { status: 500 });
                }
            },
        },
    },
});
