import { createFileRoute } from "@tanstack/react-router";
import db from "@/lib/music/database/db";
import { normalizeAlbumString } from "@/lib/music/database/normalize";

type AlbumRow = {
    id: number;
    album: string | null;
    albumartist: string | null;
    album_normalized: string | null;
    albumartist_normalized: string | null;
    year: number | null;
    mb_albumid: string | null;
    mb_releasegroupid: string | null;
    artpath: string | null;
    added: number;
};

type DuplicateGroup = {
    key: string;
    canonicalId: number;
    duplicateIds: number[];
    albums: AlbumRow[];
};

type MergeReport = {
    dryRun: boolean;
    groupsFound: number;
    albumsMerged: number;
    itemsReassigned: number;
    namesRestored: number;
    itemDuplicatesRemoved: number;
    groups: Array<{
        key: string;
        canonicalId: number;
        canonicalAlbum: string | null;
        canonicalArtist: string | null;
        merged: Array<{ id: number; album: string | null; albumartist: string | null }>;
    }>;
};

function pickCanonical(albums: AlbumRow[]): AlbumRow {
    return [...albums].sort((a, b) => {
        if ((a.mb_albumid != null) !== (b.mb_albumid != null)) {
            return a.mb_albumid != null ? -1 : 1;
        }
        if ((a.artpath != null) !== (b.artpath != null)) {
            return a.artpath != null ? -1 : 1;
        }
        return a.added - b.added;
    })[0];
}

const isUnknown = (r: AlbumRow) =>
    r.album == null || r.album === "" || r.album === "Unknown Album";

function findDuplicates(): DuplicateGroup[] {
    const all = db
        .prepare(
            `
        SELECT id, album, albumartist, album_normalized, albumartist_normalized,
               year, mb_albumid, mb_releasegroupid, artpath, added
        FROM albums
    `,
        )
        .all() as AlbumRow[];

    const viewNorm = (r: AlbumRow) =>
        isUnknown(r) ? "unknownalbum" : (r.album_normalized ?? "");

    const groups = new Map<string, AlbumRow[]>();
    const seen = new Set<number>();

    const rgGroups = new Map<string, AlbumRow[]>();
    for (const row of all) {
        if (!row.mb_releasegroupid) continue;
        const key = `rg:${row.mb_releasegroupid}`;
        if (!rgGroups.has(key)) rgGroups.set(key, []);
        rgGroups.get(key)!.push(row);
    }
    for (const [key, rows] of rgGroups) {
        if (rows.length < 2) continue;
        groups.set(key, rows);
        for (const r of rows) seen.add(r.id);
    }

    const normGroups = new Map<string, AlbumRow[]>();
    for (const row of all) {
        if (seen.has(row.id)) continue;
        if (isUnknown(row)) continue;
        const albNorm = viewNorm(row);
        if (!albNorm) continue;
        const key = `nm:${albNorm}|${row.albumartist_normalized ?? ""}|${row.year ?? ""}`;
        if (!normGroups.has(key)) normGroups.set(key, []);
        normGroups.get(key)!.push(row);
    }
    for (const [key, rows] of normGroups) {
        if (rows.length < 2) continue;
        groups.set(key, rows);
        for (const r of rows) seen.add(r.id);
    }

    const unknownsByArtistYear = new Map<string, AlbumRow[]>();
    const namedByArtistYear = new Map<string, AlbumRow[]>();
    for (const row of all) {
        if (seen.has(row.id)) continue;
        if (!row.albumartist_normalized) continue;
        const key = `${row.albumartist_normalized}|${row.year ?? ""}`;
        const bucket = isUnknown(row) ? unknownsByArtistYear : namedByArtistYear;
        if (!bucket.has(key)) bucket.set(key, []);
        bucket.get(key)!.push(row);
    }

    for (const [key, unknowns] of unknownsByArtistYear) {
        const named = namedByArtistYear.get(key) ?? [];
        if (named.length === 1) {
            const canonical = named[0];
            const groupKey = `fold:${canonical.id}`;
            groups.set(groupKey, [canonical, ...unknowns]);
            seen.add(canonical.id);
            for (const u of unknowns) seen.add(u.id);
        } else if (named.length === 0 && unknowns.length >= 2) {
            const groupKey = `fold:unknowns@${key}`;
            groups.set(groupKey, unknowns);
            for (const u of unknowns) seen.add(u.id);
        }
    }

    const dupes: DuplicateGroup[] = [];
    for (const [key, members] of groups) {
        if (members.length < 2) continue;
        const canonical = pickCanonical(members);
        dupes.push({
            key,
            canonicalId: canonical.id,
            duplicateIds: members.filter((m) => m.id !== canonical.id).map((m) => m.id),
            albums: members,
        });
    }
    return dupes;
}

function restoreNames(): number {
    const rows = db
        .prepare(
            `
        SELECT albums.id AS album_id, items.album AS real_album, COUNT(*) AS c
        FROM albums
        JOIN items ON items.album_id = albums.id
        WHERE albums.album = 'Unknown Album'
          AND items.album IS NOT NULL
          AND items.album != ''
          AND items.album != 'Unknown Album'
        GROUP BY albums.id, items.album
        ORDER BY albums.id, c DESC
    `,
        )
        .all() as Array<{ album_id: number; real_album: string; c: number }>;

    const chosen = new Map<number, string>();
    for (const r of rows) {
        if (!chosen.has(r.album_id)) chosen.set(r.album_id, r.real_album);
    }

    const update = db.prepare(
        "UPDATE albums SET album = ?, album_normalized = ? WHERE id = ?",
    );
    let count = 0;
    for (const [id, name] of chosen) {
        update.run(name, normalizeAlbumString(name), id);
        count++;
    }
    return count;
}

function executeMerge(groups: DuplicateGroup[]): {
    itemsReassigned: number;
    albumsMerged: number;
} {
    const reassign = db.prepare("UPDATE items SET album_id = ? WHERE album_id = ?");
    const deleteAlbum = db.prepare("DELETE FROM albums WHERE id = ?");
    let itemsReassigned = 0;
    let albumsMerged = 0;
    for (const group of groups) {
        for (const dupId of group.duplicateIds) {
            const result = reassign.run(group.canonicalId, dupId);
            itemsReassigned += Number(result.changes);
            deleteAlbum.run(dupId);
            albumsMerged++;
        }
    }
    return { itemsReassigned, albumsMerged };
}

type ItemDupRow = {
    id: number;
    track: number | null;
    disc: number | null;
    title: string | null;
    mb_trackid: string | null;
    file_hash: string | null;
    added: number;
};

function dedupeItemsWithinAlbums(): number {
    const albums = db
        .prepare("SELECT DISTINCT album_id FROM items WHERE album_id IS NOT NULL")
        .all() as Array<{ album_id: number }>;
    const fetchItems = db.prepare(`
        SELECT id, track, disc, title, mb_trackid, file_hash, added
        FROM items
        WHERE album_id = ?
    `);
    // Admin path: the user explicitly invoked dedupe and accepts that the
    // non-canonical rows lose their item rows. Files on disk are NOT touched —
    // the canonical row points to whichever item kept its DB row, and the
    // duplicate files (if any) get re-picked up by the next reconcile only if
    // they're outside the canonical path.
    const deleteItem = db.prepare("DELETE FROM items WHERE id = ?");
    let deleted = 0;
    for (const { album_id } of albums) {
        const items = fetchItems.all(album_id) as ItemDupRow[];
        const buckets = new Map<string, ItemDupRow[]>();
        for (const it of items) {
            const key =
                it.track != null
                    ? `td:${it.track}|${it.disc ?? ""}`
                    : it.title
                      ? `t:${it.title.toLowerCase().trim()}`
                      : null;
            if (!key) continue;
            const arr = buckets.get(key);
            if (arr) arr.push(it);
            else buckets.set(key, [it]);
        }
        for (const group of buckets.values()) {
            if (group.length < 2) continue;
            const canonical = [...group].sort((a, b) => {
                if ((a.mb_trackid != null) !== (b.mb_trackid != null)) {
                    return a.mb_trackid != null ? -1 : 1;
                }
                if ((a.file_hash != null) !== (b.file_hash != null)) {
                    return a.file_hash != null ? -1 : 1;
                }
                return a.added - b.added;
            })[0];
            for (const it of group) {
                if (it.id === canonical.id) continue;
                deleteItem.run(it.id);
                deleted++;
            }
        }
    }
    return deleted;
}

function countItemDuplicates(): number {
    const rows = db
        .prepare(
            `
        SELECT album_id, track, disc, title FROM items
        WHERE album_id IS NOT NULL
    `,
        )
        .all() as Array<{
        album_id: number;
        track: number | null;
        disc: number | null;
        title: string | null;
    }>;
    const buckets = new Map<string, number>();
    for (const r of rows) {
        const key =
            r.track != null
                ? `${r.album_id}|td|${r.track}|${r.disc ?? ""}`
                : r.title
                  ? `${r.album_id}|t|${r.title.toLowerCase().trim()}`
                  : null;
        if (!key) continue;
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    let extras = 0;
    for (const count of buckets.values()) {
        if (count > 1) extras += count - 1;
    }
    return extras;
}

async function runDedup(dryRun: boolean): Promise<MergeReport> {
    const groups = findDuplicates();
    const report: MergeReport = {
        dryRun,
        groupsFound: groups.length,
        albumsMerged: 0,
        itemsReassigned: 0,
        namesRestored: 0,
        itemDuplicatesRemoved: 0,
        groups: groups.map((g) => {
            const canon = g.albums.find((a) => a.id === g.canonicalId)!;
            return {
                key: g.key,
                canonicalId: g.canonicalId,
                canonicalAlbum: canon.album,
                canonicalArtist: canon.albumartist,
                merged: g.albums
                    .filter((a) => a.id !== g.canonicalId)
                    .map((a) => ({ id: a.id, album: a.album, albumartist: a.albumartist })),
            };
        }),
    };

    if (dryRun) {
        report.itemDuplicatesRemoved = countItemDuplicates();
        return report;
    }

    db.transaction(() => {
        const merge = executeMerge(groups);
        report.albumsMerged = merge.albumsMerged;
        report.itemsReassigned = merge.itemsReassigned;
        report.namesRestored = restoreNames();
        report.itemDuplicatesRemoved = dedupeItemsWithinAlbums();
    })();

    return report;
}

export const Route = createFileRoute("/api/admin/deduplicate-albums")({
    server: {
        handlers: {
            GET: async () => {
                try {
                    const report = await runDedup(true);
                    return Response.json(report);
                } catch (error) {
                    console.error("[API] deduplicate-albums (dry run) error:", error);
                    return Response.json(
                        {
                            error:
                                error instanceof Error
                                    ? error.message
                                    : "Deduplication dry run failed",
                        },
                        { status: 500 },
                    );
                }
            },

            POST: async ({ request }) => {
                try {
                    const { searchParams } = new URL(request.url);
                    const dryRun = searchParams.get("dryRun") === "true";
                    const report = await runDedup(dryRun);
                    return Response.json(report);
                } catch (error) {
                    console.error("[API] deduplicate-albums error:", error);
                    return Response.json(
                        {
                            error:
                                error instanceof Error
                                    ? error.message
                                    : "Deduplication failed",
                        },
                        { status: 500 },
                    );
                }
            },
        },
    },
});
