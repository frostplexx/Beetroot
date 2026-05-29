import { createFileRoute } from "@tanstack/react-router";
import { getAlbumById } from "@/lib/music/database/albums";
import { serveArtFromPath, notFoundArt } from "@/lib/api/serve-art";
import { verifyAlbumPresence } from "@/lib/music/repository/verify-album";

export const Route = createFileRoute("/api/album/$id/art")({
    server: {
        handlers: {
            GET: async ({ request, params }) => {
                const albumId = parseInt(params.id, 10);
                if (!Number.isFinite(albumId) || albumId <= 0) {
                    return notFoundArt();
                }

                const album = getAlbumById(albumId);
                if (!album || !album.artpath) {
                    if (album) void verifyAlbumPresence(albumId);
                    return notFoundArt();
                }

                const { searchParams } = new URL(request.url);
                const size = searchParams.get("size");
                const response = await serveArtFromPath(request, album.artpath, size);
                if (response.status === 404) void verifyAlbumPresence(albumId);
                return response;
            },
        },
    },
});
