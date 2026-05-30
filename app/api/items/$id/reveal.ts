import { createFileRoute } from "@tanstack/react-router";
import { getItemById } from "@/lib/music/database";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";

const execFileAsync = promisify(execFile);

export const Route = createFileRoute("/api/items/$id/reveal")({
    server: {
        handlers: {
            POST: async ({ params }) => {
                const itemId = parseInt(params.id, 10);
                if (Number.isNaN(itemId)) {
                    return Response.json({ error: "Invalid item id" }, { status: 400 });
                }
                const item = getItemById(itemId);
                if (!item) {
                    return Response.json({ error: "Item not found" }, { status: 404 });
                }
                if (!fs.existsSync(item.path)) {
                    return Response.json(
                        { error: `File does not exist: ${item.path}` },
                        { status: 404 },
                    );
                }
                if (process.platform !== "darwin") {
                    return Response.json(
                        { error: "Reveal-in-file-manager currently only implemented on macOS" },
                        { status: 501 },
                    );
                }
                try {
                    await execFileAsync("open", ["-R", item.path]);
                    return Response.json({ revealed: true, path: item.path });
                } catch (err) {
                    return Response.json(
                        {
                            error: `Failed to reveal file: ${err instanceof Error ? err.message : String(err)}`,
                        },
                        { status: 500 },
                    );
                }
            },
        },
    },
});
