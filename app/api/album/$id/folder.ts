import { createFileRoute } from "@tanstack/react-router";
import { getItemsByAlbum } from "@/lib/music/database";
import * as path from "path";

export const Route = createFileRoute("/api/album/$id/folder")({
    server: {
        handlers: {
            GET: async ({ params }) => {
                const albumId = parseInt(params.id, 10);
                if (!Number.isFinite(albumId) || albumId <= 0) {
                    return Response.json({ error: "Invalid album id" }, { status: 400 });
                }
                const items = getItemsByAlbum(albumId);
                const withPath = items.find((i) => i.path);
                if (!withPath) {
                    return Response.json({ error: "No items for album" }, { status: 404 });
                }
                return Response.json({ folder: path.dirname(withPath.path) });
            },
        },
    },
});
