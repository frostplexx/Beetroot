import { createFileRoute } from "@tanstack/react-router";
import { getItemsByAlbum } from "@/lib/music/database";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execFileAsync = promisify(execFile);

export const Route = createFileRoute("/api/album/$id/reveal")({
    server: {
        handlers: {
            POST: async ({ params }) => {
                const albumId = parseInt(params.id, 10);
                if (!Number.isFinite(albumId) || albumId <= 0) {
                    return Response.json({ error: "Invalid album id" }, { status: 400 });
                }

                const items = getItemsByAlbum(albumId);
                const present = items.find((i) => i.path && fs.existsSync(i.path));
                if (!present) {
                    return Response.json(
                        { error: "No files on disk for this album" },
                        { status: 404 },
                    );
                }

                if (process.platform !== "darwin") {
                    return Response.json(
                        { error: "Reveal-in-file-manager currently only implemented on macOS" },
                        { status: 501 },
                    );
                }

                const folder = path.dirname(present.path);
                try {
                    await execFileAsync("open", ["-R", folder]);
                    return Response.json({ revealed: true, folder });
                } catch (err) {
                    return Response.json(
                        {
                            error: `Failed to reveal folder: ${err instanceof Error ? err.message : String(err)}`,
                        },
                        { status: 500 },
                    );
                }
            },
        },
    },
});
