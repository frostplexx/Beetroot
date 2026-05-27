import { NextResponse } from "next/server";
import db from "@/lib/music/database/db";

export const dynamic = "force-dynamic";

type Row = { day: string; count: number };

export function GET() {
    const rows = db
        .prepare(
            `SELECT date(added, 'unixepoch') AS day, COUNT(*) AS count
             FROM items
             WHERE added IS NOT NULL
             GROUP BY day
             ORDER BY day`
        )
        .all() as Row[];

    const data = rows.map((r) => ({ date: r.day, value: r.count }));
    return NextResponse.json(data);
}
