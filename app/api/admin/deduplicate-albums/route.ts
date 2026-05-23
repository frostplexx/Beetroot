import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/music/database/db';
import { normalizeAlbumString } from '@/lib/music/database/normalize';

export const dynamic = 'force-dynamic';

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
    groups: Array<{
        key: string;
        canonicalId: number;
        canonicalAlbum: string | null;
        canonicalArtist: string | null;
        merged: Array<{ id: number; album: string | null; albumartist: string | null }>;
    }>;
};

function pickCanonical(albums: AlbumRow[]): AlbumRow {
    // Prefer: has mb_albumid > has artpath > oldest added
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

function findDuplicates(): DuplicateGroup[] {
    const all = db.prepare(`
        SELECT id, album, albumartist, album_normalized, albumartist_normalized,
               year, mb_albumid, mb_releasegroupid, artpath, added
        FROM albums
    `).all() as AlbumRow[];

    const groups = new Map<string, AlbumRow[]>();
    const seen = new Set<number>();

    // First pass: group by mb_releasegroupid (strongest signal)
    for (const row of all) {
        if (!row.mb_releasegroupid) continue;
        const key = `rg:${row.mb_releasegroupid}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
        seen.add(row.id);
    }

    // Second pass: group remaining albums by normalized (album, artist, year)
    for (const row of all) {
        if (seen.has(row.id)) continue;
        if (!row.album_normalized) continue;
        const key = `nm:${row.album_normalized}|${row.albumartist_normalized ?? ''}|${row.year ?? ''}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
    }

    // Keep only groups with 2+ members
    const dupes: DuplicateGroup[] = [];
    for (const [key, members] of groups) {
        if (members.length < 2) continue;
        const canonical = pickCanonical(members);
        dupes.push({
            key,
            canonicalId: canonical.id,
            duplicateIds: members.filter(m => m.id !== canonical.id).map(m => m.id),
            albums: members,
        });
    }
    return dupes;
}

function restoreNames(): number {
    // For any album currently named 'Unknown Album' but where its items carry a
    // real album name, restore the most common real name. Refresh album_normalized.
    const rows = db.prepare(`
        SELECT albums.id AS album_id, items.album AS real_album, COUNT(*) AS c
        FROM albums
        JOIN items ON items.album_id = albums.id
        WHERE albums.album = 'Unknown Album'
          AND items.album IS NOT NULL
          AND items.album != ''
          AND items.album != 'Unknown Album'
        GROUP BY albums.id, items.album
        ORDER BY albums.id, c DESC
    `).all() as Array<{ album_id: number; real_album: string; c: number }>;

    // Pick the highest-count name per album_id (first occurrence due to ORDER BY)
    const chosen = new Map<number, string>();
    for (const r of rows) {
        if (!chosen.has(r.album_id)) chosen.set(r.album_id, r.real_album);
    }

    const update = db.prepare(
        'UPDATE albums SET album = ?, album_normalized = ? WHERE id = ?'
    );
    let count = 0;
    for (const [id, name] of chosen) {
        update.run(name, normalizeAlbumString(name), id);
        count++;
    }
    return count;
}

function executeMerge(groups: DuplicateGroup[]): { itemsReassigned: number; albumsMerged: number } {
    const reassign = db.prepare('UPDATE items SET album_id = ? WHERE album_id = ?');
    const deleteAlbum = db.prepare('DELETE FROM albums WHERE id = ?');

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

async function runDedup(dryRun: boolean): Promise<MergeReport> {
    const groups = findDuplicates();

    const report: MergeReport = {
        dryRun,
        groupsFound: groups.length,
        albumsMerged: 0,
        itemsReassigned: 0,
        namesRestored: 0,
        groups: groups.map(g => {
            const canon = g.albums.find(a => a.id === g.canonicalId)!;
            return {
                key: g.key,
                canonicalId: g.canonicalId,
                canonicalAlbum: canon.album,
                canonicalArtist: canon.albumartist,
                merged: g.albums
                    .filter(a => a.id !== g.canonicalId)
                    .map(a => ({ id: a.id, album: a.album, albumartist: a.albumartist })),
            };
        }),
    };

    if (dryRun) return report;

    db.transaction(() => {
        const merge = executeMerge(groups);
        report.albumsMerged = merge.albumsMerged;
        report.itemsReassigned = merge.itemsReassigned;
        report.namesRestored = restoreNames();
    })();

    return report;
}

/**
 * POST /api/admin/deduplicate-albums
 * Query params:
 *   - dryRun: 'true' | 'false' (default 'false')
 *
 * Groups duplicate albums by mb_releasegroupid first, then by normalized
 * (album, albumartist, year). For each group, picks a canonical album (prefers
 * one with mb_albumid, then artpath, then oldest), reassigns all items from
 * duplicates to canonical, restores 'Unknown Album' names from item tags where
 * possible, and deletes the duplicate album rows.
 */
export async function POST(request: NextRequest) {
    try {
        const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';
        const report = await runDedup(dryRun);
        return NextResponse.json(report);
    } catch (error) {
        console.error('[API] deduplicate-albums error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Deduplication failed' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/admin/deduplicate-albums
 * Convenience alias for POST with dryRun=true. Returns the proposed merge
 * plan without making any changes.
 */
export async function GET() {
    try {
        const report = await runDedup(true);
        return NextResponse.json(report);
    } catch (error) {
        console.error('[API] deduplicate-albums (dry run) error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Deduplication dry run failed' },
            { status: 500 }
        );
    }
}
