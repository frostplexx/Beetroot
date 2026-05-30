import { createFileRoute } from "@tanstack/react-router";
import { getAlbumById } from "@/lib/music/database/albums";
import Repository from "@/lib/music/repository";

export const Route = createFileRoute("/api/album/$id/restore")({
    server: {
        handlers: {
            POST: async ({ params }) => {
                const albumId = parseInt(params.id, 10);
                if (!Number.isFinite(albumId) || albumId <= 0) {
                    return Response.json({ error: "Invalid album ID" }, { status: 400 });
                }
                const album = getAlbumById(albumId);
                if (!album) {
                    return Response.json({ error: "Album not found" }, { status: 404 });
                }
                if (album.marked_for_deletion == null) {
                    return Response.json(
                        { error: "Album is not soft-deleted" },
                        { status: 409 },
                    );
                }

                try {
                    const result = Repository.restoreAlbum(albumId);
                    return Response.json({ restored: true, albumId, ...result });
                } catch (error) {
                    console.error("Error restoring album:", error);
                    return Response.json(
                        {
                            error: "Failed to restore album",
                            details: error instanceof Error ? error.message : "Unknown error",
                        },
                        { status: 500 },
                    );
                }
            },
        },
    },
});
