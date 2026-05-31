import { createFileRoute } from "@tanstack/react-router";
import db from "@/lib/music/database/db";

type Row = { day: string; count: number };

export const Route = createFileRoute("/api/admin/import-heatmap")({
    server: {
        handlers: {
            GET: async () => {
                // items.added is JS Date.now() milliseconds; unixepoch wants
                // seconds, so divide before formatting.
                const rows = db
                    .prepare(
                        `SELECT date(added / 1000, 'unixepoch') AS day, COUNT(*) AS count
                         FROM items
                         WHERE added IS NOT NULL AND added > 0
                         GROUP BY day
                         ORDER BY day`,
                    )
                    .all() as Row[];

                const data = rows
                    .filter((r) => r.day !== null && r.day !== "")
                    .map((r) => ({ date: r.day, value: r.count }));
                return Response.json(data);
            },
        },
    },
});
