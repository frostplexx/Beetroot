import { createFileRoute } from "@tanstack/react-router";
import db from "@/lib/music/database/db";

type Row = { day: string; count: number };

export const Route = createFileRoute("/api/admin/import-heatmap")({
    server: {
        handlers: {
            GET: async () => {
                const rows = db
                    .prepare(
                        `SELECT date(added, 'unixepoch') AS day, COUNT(*) AS count
                         FROM items
                         WHERE added IS NOT NULL
                         GROUP BY day
                         ORDER BY day`,
                    )
                    .all() as Row[];

                const data = rows.map((r) => ({ date: r.day, value: r.count }));
                return Response.json(data);
            },
        },
    },
});
