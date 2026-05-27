import { revalidateTag, unstable_cache } from "next/cache"
import db from "./db"
import { decodeRows, decodeRow } from "./utils"
import { normalizeAlbumString } from "./normalize"

export const ALBUMS_CACHE_TAG = "albums"

function invalidateAlbumsCache() {
    try {
        revalidateTag(ALBUMS_CACHE_TAG, "max")
    } catch {
        // revalidateTag throws if called outside a request context (e.g. during
        // initial reconcile on server boot). The cache will refresh on its own
        // via the `revalidate: 60` window in those cases.
    }
}

// Cache for schema introspection - loaded once on first use
let validAlbumsColumns: Set<string> | null = null;

function getValidAlbumsColumns(): Set<string> {
    if (!validAlbumsColumns) {
        const columns = db.prepare('PRAGMA table_info(albums)').all() as Array<{ name: string }>;
        validAlbumsColumns = new Set(columns.map(c => c.name));
    }
    return validAlbumsColumns;
}

// Pre-built INSERT statement - initialized on first use.
// UPDATE is built dynamically per-call because we only update fields that
// are NULL/empty in the DB ("fill NULLs only" strategy), so the column list varies.
let albumInsertStmt: ReturnType<typeof db.prepare> | null = null;
let albumUpdateColumnsList: string[] | null = null;
let albumInsertColumnsList: string[] | null = null;

function getAlbumStatements() {
    if (!albumInsertStmt) {
        const validColumns = getValidAlbumsColumns();
        const allColumns = Array.from(validColumns);

        // Columns eligible for UPDATE: exclude 'id' and 'added' to preserve original timestamp
        albumUpdateColumnsList = allColumns.filter(col => col !== 'id' && col !== 'added');

        // INSERT: exclude 'id' (auto-increment)
        albumInsertColumnsList = allColumns.filter(col => col !== 'id');
        const insertFields = albumInsertColumnsList.join(', ');
        const insertPlaceholders = albumInsertColumnsList.map(() => '?').join(', ');
        albumInsertStmt = db.prepare(`INSERT INTO albums (${insertFields}) VALUES (${insertPlaceholders})`);
    }
    return { albumInsertStmt, albumUpdateColumnsList, albumInsertColumnsList };
}

export interface Album {
    id: number
    album: string
    albumartist: string
    albumartist_credit: string | null
    albumartists: string | null
    albumartists_credit: string | null
    albumartist_sort: string | null
    albumartists_sort: string | null
    albumdisambig: string | null
    albumstatus: string | null
    albumtype: string | null
    albumtypes: string | null
    artpath: string | null
    asin: string | null
    barcode: string | null
    catalognum: string | null
    comp: number | null
    country: string | null
    day: number | null
    discogs_albumid: number | null
    discogs_artistid: number | null
    discogs_labelid: number | null
    disctotal: number | null
    genres: string | null
    label: string | null
    language: string | null
    mb_albumartistid: string | null
    mb_albumartistids: string | null
    mb_albumid: string | null
    mb_releasegroupid: string | null
    month: number | null
    original_day: number | null
    original_month: number | null
    original_year: number | null
    r128_album_gain: number | null
    releasegroupdisambig: string | null
    release_group_title: string | null
    rg_album_gain: number | null
    rg_album_peak: number | null
    script: string | null
    style: string | null
    year: number | null
    added: number
    missing_since: number | null
    // Computed properties
    albumtotal?: number
    path?: string | null
    [key: string]: any
}

export function getAllAlbums(): Album[] {
    try {
        const stmt = db.prepare(`
            SELECT *
            FROM albums
            ORDER BY added DESC
        `)
        const rows = stmt.all() as Record<string, any>[]
        return decodeRows(rows) as Album[]
    } catch (error) {
        console.error("Error fetching albums:", error)
        return []
    }
}

// Slim projection used by the library grid — only the columns AlbumCard reads.
// Keeps the JSON / RSC payload small (the full Album row carries 45+ fields).
export interface AlbumCardData {
    id: number
    album: string
    albumartist: string
    artpath: string | null
    added: number
    missing_since: number | null
}

export type AlbumSort = "recently-added" | "name" | "artist" | "year"

const SORT_CLAUSES: Record<AlbumSort, string> = {
    "recently-added": "ORDER BY added DESC",
    "name":           "ORDER BY album ASC",
    "artist":         "ORDER BY albumartist ASC",
    "year":           "ORDER BY year DESC, album ASC",
}

export function getAlbumsPaginatedSlim(page: number = 0, pageSize: number = 30, sort: AlbumSort = "recently-added"): AlbumCardData[] {
    try {
        const offset = page * pageSize
        const orderClause = SORT_CLAUSES[sort] ?? SORT_CLAUSES["recently-added"]
        const stmt = db.prepare(`
            SELECT id, album, albumartist, artpath, added, missing_since
            FROM albums
            ${orderClause}
            LIMIT ? OFFSET ?
        `)
        const rows = stmt.all(pageSize, offset) as Record<string, any>[]
        return decodeRows(rows) as AlbumCardData[]
    } catch (error) {
        console.error("Error fetching paginated slim albums:", error)
        return []
    }
}

// Cached wrappers. Invalidated by `revalidateTag(ALBUMS_CACHE_TAG)` in the
// write paths and on reconcile completion (see reconcile-service.ts).
export const getCachedAlbumsPaginatedSlim = unstable_cache(
    async (page: number, pageSize: number, sort: AlbumSort = "recently-added") => getAlbumsPaginatedSlim(page, pageSize, sort),
    ["albums-paginated-slim"],
    { tags: [ALBUMS_CACHE_TAG], revalidate: 60 }
)

export const getCachedAlbumCount = unstable_cache(
    async () => getAlbumCount(),
    ["albums-count"],
    { tags: [ALBUMS_CACHE_TAG], revalidate: 60 }
)

export function getAlbumsPaginated(page: number = 0, pageSize: number = 24): Album[] {
    try {
        const offset = page * pageSize
        const stmt = db.prepare(`
            SELECT *
            FROM albums
            ORDER BY added DESC
            LIMIT ? OFFSET ?
        `)
        const rows = stmt.all(pageSize, offset) as Record<string, any>[]
        return decodeRows(rows) as Album[]
    } catch (error) {
        console.error("Error fetching paginated albums:", error)
        return []
    }
}

export function getAlbumById(id: number): Album | null {
    try {
        const stmt = db.prepare(`
            SELECT *
            FROM albums
            WHERE id = ?
        `)
        const row = stmt.get(id)
        return row ? decodeRow(row) as Album : null
    } catch (error) {
        console.error("Error fetching album:", error)
        return null
    }
}

export function getAlbumCount(): number {
    try {
        const result = db.prepare("SELECT COUNT(*) as count FROM albums").get() as {
            count: number
        }
        return result.count
    } catch (error) {
        console.error("Error counting albums:", error)
        return 0
    }
}

export function searchAlbums(query: string, page: number = 0, pageSize: number = 24): Album[] {
    try {
        const offset = page * pageSize

        // Use FTS5 for full-text search
        // Porter tokenizer handles stemming (legend→legends)
        // Unicode61 handles diacritics (á→a) and case folding
        const stmt = db.prepare(`
            SELECT albums.*
            FROM albums
            INNER JOIN albums_fts ON albums.id = albums_fts.rowid
            WHERE albums_fts MATCH ?
            ORDER BY albums.added DESC
            LIMIT ? OFFSET ?
        `)

        const rows = stmt.all(query.trim(), pageSize, offset) as Record<string, any>[]
        return decodeRows(rows) as Album[]
    } catch (error) {
        console.error("Error searching albums:", error)
        return []
    }
}

export function getAlbumsSearchCount(query: string): number {
    try {
        // Use FTS5 for full-text search
        const stmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM albums
            INNER JOIN albums_fts ON albums.id = albums_fts.rowid
            WHERE albums_fts MATCH ?
        `)

        const result = stmt.get(query.trim()) as { count: number }
        return result.count
    } catch (error) {
        console.error("Error counting search results:", error)
        return 0
    }
}

export function writeOrUpdateAlbum(album: Album): number {
    try {
        // Get valid columns from schema (cached)
        const validColumns = getValidAlbumsColumns();

        // Normalize album and artist names for matching. When the album tag is
        // missing, use the same canonical 'unknownalbum' value the migration
        // backfilled with, so a sparse track joins (rather than duplicates) any
        // existing 'Unknown Album' row by the same artist+year.
        const normalizedAlbum = normalizeAlbumString(album.album) || 'unknownalbum';
        const normalizedArtist = normalizeAlbumString(album.albumartist);

        // Match cascade: mb_albumid → mb_releasegroupid → normalized (album+artist+year).
        // mb_releasegroupid groups different editions/regions of the same release, and is
        // stable across tracks whose albumartist differs (e.g. soundtracks).
        let existing: { id: number; mb_albumid: string | null } | undefined
        if (album.mb_albumid) {
            existing = db.prepare('SELECT id, mb_albumid FROM albums WHERE mb_albumid = ?').get(album.mb_albumid) as { id: number; mb_albumid: string | null } | undefined
        }
        if (!existing && album.mb_releasegroupid) {
            existing = db.prepare('SELECT id, mb_albumid FROM albums WHERE mb_releasegroupid = ?').get(album.mb_releasegroupid) as { id: number; mb_albumid: string | null } | undefined
        }
        if (!existing && normalizedAlbum) {
            existing = db.prepare(`
                SELECT id, mb_albumid FROM albums
                WHERE album_normalized = ?
                  AND (albumartist_normalized IS NULL AND ? IS NULL
                       OR albumartist_normalized = ?)
                  AND (year IS NULL AND ? IS NULL OR year = ?)
            `).get(normalizedAlbum, normalizedArtist, normalizedArtist, album.year, album.year) as { id: number; mb_albumid: string | null } | undefined
        }

        // Prepare album data for database - only include valid columns
        const dbAlbum: Record<string, any> = {}
        for (const key of Object.keys(album)) {
            if (validColumns.has(key)) {
                dbAlbum[key] = (album as any)[key]
            }
        }

        // Add normalized values for duplicate prevention
        dbAlbum.album_normalized = normalizedAlbum;
        dbAlbum.albumartist_normalized = normalizedArtist;

        // Ensure album name is not NULL (use 'Unknown Album' as fallback)
        if (!dbAlbum.album) {
            dbAlbum.album = 'Unknown Album';
        }

        if (existing) {
            // Fill-NULLs-only update: never overwrite existing non-empty values.
            // This preserves the DB's view of the album (per user directive: "the album
            // from the database if it exists should always be preferred") and lets sparse
            // tracks improve metadata over time without destroying good data.
            const { albumUpdateColumnsList } = getAlbumStatements();
            const current = db.prepare('SELECT * FROM albums WHERE id = ?').get(existing.id) as Record<string, any>;

            const updates: Record<string, any> = {};
            for (const col of albumUpdateColumnsList!) {
                const currentVal = current[col];
                const newVal = dbAlbum[col];

                // Treat 'Unknown Album' as empty for the `album` column so a real
                // name can later replace a placeholder set by a track with missing tags.
                const currentIsEmpty =
                    currentVal === null ||
                    currentVal === '' ||
                    (col === 'album' && currentVal === 'Unknown Album');
                const newHasValue =
                    newVal !== null &&
                    newVal !== undefined &&
                    newVal !== '' &&
                    !(col === 'album' && newVal === 'Unknown Album');

                if (currentIsEmpty && newHasValue) {
                    updates[col] = newVal;
                }
            }

            if (Object.keys(updates).length > 0) {
                const cols = Object.keys(updates);
                const fields = cols.map(c => `${c} = ?`).join(', ');
                const values = cols.map(c => updates[c]);
                values.push(existing.id);
                db.prepare(`UPDATE albums SET ${fields} WHERE id = ?`).run(...values);
                invalidateAlbumsCache();
            }
            return existing.id;
        } else {
            // Insert new album using pre-built statement
            const { albumInsertStmt, albumInsertColumnsList } = getAlbumStatements();
            const values = albumInsertColumnsList!.map(col => dbAlbum[col] ?? null);
            const result = albumInsertStmt!.run(...values);
            invalidateAlbumsCache();
            return result.lastInsertRowid as number
        }
    } catch (error) {
        console.error('Error writing/updating album:', error)
        throw error
    }
}

// Get albums with missing artwork (artpath is null or empty)
// Returns all albums, no limit - caller can paginate if needed
export function getAlbumsWithMissingArtwork(limit?: number): Album[] {
    try {
        const sql = `
            SELECT *
            FROM albums
            WHERE artpath IS NULL OR artpath = ''
            ORDER BY added DESC
            ${limit ? `LIMIT ${limit}` : ''}
        `
        const stmt = db.prepare(sql)
        const rows = stmt.all() as Record<string, any>[]
        return decodeRows(rows) as Album[]
    } catch (error) {
        console.error('Error fetching albums with missing artwork:', error)
        return []
    }
}

// Mark album as missing
export function markAlbumMissing(albumId: number): void {
    try {
        const stmt = db.prepare(`
            UPDATE albums
            SET missing_since = ?
            WHERE id = ?
        `)
        stmt.run(Date.now(), albumId)
        invalidateAlbumsCache()
    } catch (error) {
        console.error('Error marking album as missing:', error)
        throw error
    }
}

// Unmark album as missing
export function unmarkAlbumMissing(albumId: number): void {
    try {
        const stmt = db.prepare(`
            UPDATE albums
            SET missing_since = NULL
            WHERE id = ?
        `)
        stmt.run(albumId)
        invalidateAlbumsCache()
    } catch (error) {
        console.error('Error unmarking album as missing:', error)
        throw error
    }
}

// Check if all items in an album are missing and mark album accordingly
export function checkAndUpdateAlbumMissingStatus(albumId: number): void {
    try {
        // Get count of all items and missing items for this album
        const result = db.prepare(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN missing_since IS NOT NULL THEN 1 ELSE 0 END) as missing
            FROM items
            WHERE album_id = ?
        `).get(albumId) as { total: number; missing: number }

        if (result.total === 0) {
            // No items in album, do nothing
            return
        }

        if (result.missing === result.total) {
            // All items are missing, mark album as missing
            markAlbumMissing(albumId)
        } else {
            // At least one item is not missing, unmark album
            unmarkAlbumMissing(albumId)
        }
    } catch (error) {
        console.error('Error checking album missing status:', error)
        throw error
    }
}

// Update only the artpath for an album (focused update to avoid lost-update bugs)
export function updateAlbumArtpath(albumId: number, artpath: string): void {
    try {
        const stmt = db.prepare(`
            UPDATE albums
            SET artpath = ?
            WHERE id = ?
        `)
        // D4: artpath is now TEXT, no Buffer conversion needed
        stmt.run(artpath, albumId)
        invalidateAlbumsCache()
    } catch (error) {
        console.error('Error updating album artpath:', error)
        throw error
    }
}

// Unconditionally overwrite the supplied album fields. Use this for explicit
// user edits — [[writeOrUpdateAlbum]] is fill-NULLs-only and will silently
// drop changes to columns that already hold a value.
export function updateAlbumFields(albumId: number, fields: Partial<Album>): void {
    const validColumns = getValidAlbumsColumns();
    const cols: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(fields)) {
        if (key === 'id' || key === 'added') continue;
        if (!validColumns.has(key)) continue;
        cols.push(key);
        values.push(value);

        if (key === 'album' && validColumns.has('album_normalized')) {
            cols.push('album_normalized');
            values.push(normalizeAlbumString(value as string) || 'unknownalbum');
        }
        if (key === 'albumartist' && validColumns.has('albumartist_normalized')) {
            cols.push('albumartist_normalized');
            values.push(normalizeAlbumString(value as string));
        }
    }

    if (cols.length === 0) return;

    try {
        const setClause = cols.map(c => `${c} = ?`).join(', ');
        db.prepare(`UPDATE albums SET ${setClause} WHERE id = ?`).run(...values, albumId);
        invalidateAlbumsCache();
    } catch (error) {
        console.error('Error updating album fields:', error);
        throw error;
    }
}
