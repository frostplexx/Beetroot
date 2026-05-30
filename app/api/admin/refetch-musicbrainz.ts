import { createFileRoute } from "@tanstack/react-router";
import db from "@/lib/music/database/db";
import { Item, writeOrUpdateAlbum } from "@/lib/music/database";
import { decodeRows } from "@/lib/music/database/utils";
import { itemToAlbum } from "@/lib/music/repository";
import { MusicBrainzSource } from "@/lib/music/repository/sources/musicbrainz/musicbrainz";

const MB_FIELDS_OF_INTEREST = [
    "album",
    "albumartist",
    "artist",
    "title",
    "year",
    "month",
    "day",
    "mb_albumid",
    "mb_releasegroupid",
    "mb_trackid",
    "mb_artistid",
    "mb_artistids",
    "mb_albumartistid",
    "mb_albumartistids",
    "mb_releasetrackid",
    "acoustid_id",
    "track",
    "tracktotal",
    "disc",
    "disctotal",
    "length",
    "country",
    "albumstatus",
    "isrc",
    "barcode",
    "asin",
    "catalognum",
    "label",
] as const;

type ItemRow = Record<string, any> & { id: number; album_id: number | null };

function findOrphanItems(): Item[] {
    const rows = db
        .prepare(
            `
        SELECT items.*
        FROM items
        JOIN albums ON items.album_id = albums.id
        WHERE albums.album = 'Unknown Album'
           OR albums.album IS NULL
           OR albums.album = ''
        ORDER BY items.id
    `,
        )
        .all() as Record<string, any>[];
    return decodeRows(rows) as Item[];
}

function buildItemFillUpdate(
    currentRow: ItemRow,
    newData: Item,
): { fields: string[]; values: any[]; merged: Item } {
    const fields: string[] = [];
    const values: any[] = [];
    const merged: any = { ...currentRow };
    for (const key of MB_FIELDS_OF_INTEREST) {
        const cur = currentRow[key];
        const nv = (newData as any)[key];
        const curEmpty = cur === null || cur === undefined || cur === "";
        const newHasValue = nv !== null && nv !== undefined && nv !== "";
        if (curEmpty && newHasValue) {
            fields.push(`${key} = ?`);
            values.push(nv);
            merged[key] = nv;
        }
    }
    return { fields, values, merged: merged as Item };
}

async function relinkItemToAlbum(
    itemId: number,
    merged: Item,
    currentAlbumId: number | null,
): Promise<number | null> {
    const albumInput = itemToAlbum(merged);
    const newAlbumId = writeOrUpdateAlbum(albumInput);
    if (newAlbumId !== currentAlbumId) {
        db.prepare("UPDATE items SET album_id = ? WHERE id = ?").run(newAlbumId, itemId);
        return newAlbumId;
    }
    return null;
}

type Report = {
    probed: number;
    enriched: number;
    relinked: number;
    failed: number;
    details: Array<{
        itemId: number;
        path: string;
        oldAlbumId: number | null;
        newAlbumId: number | null;
        filledFields: string[];
        error?: string;
    }>;
};

export const Route = createFileRoute("/api/admin/refetch-musicbrainz")({
    server: {
        handlers: {
            GET: async () => {
                const items = findOrphanItems();
                return Response.json({
                    count: items.length,
                    items: items.map((i) => ({
                        id: i.id,
                        path: i.path,
                        title: i.title,
                        artist: i.artist,
                        album: i.album,
                        year: i.year,
                        mb_releasegroupid: i.mb_releasegroupid,
                        mb_albumid: i.mb_albumid,
                        album_id: i.album_id,
                    })),
                });
            },

            POST: async () => {
                const items = findOrphanItems();
                const report: Report = {
                    probed: items.length,
                    enriched: 0,
                    relinked: 0,
                    failed: 0,
                    details: [],
                };
                const mb = new MusicBrainzSource();
                for (const item of items) {
                    const detail: Report["details"][number] = {
                        itemId: item.id,
                        path: item.path,
                        oldAlbumId: item.album_id,
                        newAlbumId: null,
                        filledFields: [],
                    };
                    try {
                        const enriched = await mb.getData({ ...item });
                        const currentRow = db
                            .prepare("SELECT * FROM items WHERE id = ?")
                            .get(item.id) as ItemRow | undefined;
                        if (!currentRow) {
                            detail.error = "item disappeared during lookup";
                            report.failed++;
                            report.details.push(detail);
                            continue;
                        }
                        const { fields, values, merged } = buildItemFillUpdate(
                            currentRow,
                            enriched,
                        );
                        if (fields.length === 0) {
                            report.details.push(detail);
                            continue;
                        }
                        values.push(item.id);
                        db.prepare(
                            `UPDATE items SET ${fields.join(", ")} WHERE id = ?`,
                        ).run(...values);
                        detail.filledFields = fields.map((f) => f.split(" ")[0]);
                        report.enriched++;
                        const newAlbumId = await relinkItemToAlbum(
                            item.id,
                            merged,
                            item.album_id,
                        );
                        if (newAlbumId !== null) {
                            detail.newAlbumId = newAlbumId;
                            report.relinked++;
                        }
                    } catch (err) {
                        detail.error = err instanceof Error ? err.message : String(err);
                        report.failed++;
                    }
                    report.details.push(detail);
                }
                return Response.json(report);
            },
        },
    },
});
