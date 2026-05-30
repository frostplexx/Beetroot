import db from "./db"
import { decodeRows, decodeRow } from "./utils"
import { globalConfig } from "@/lib/config"

// Cache for schema introspection - loaded once on first use
let validItemsColumns: Set<string> | null = null;

function getValidItemsColumns(): Set<string> {
    if (!validItemsColumns) {
        const columns = db.prepare('PRAGMA table_info(items)').all() as Array<{ name: string }>;
        validItemsColumns = new Set(columns.map(c => c.name));
    }
    return validItemsColumns;
}

// Pre-built SQL statements (D2) - initialized on first use
let itemUpdateStmt: ReturnType<typeof db.prepare> | null = null;
let itemInsertStmt: ReturnType<typeof db.prepare> | null = null;
let updateColumnsList: string[] | null = null;
let insertColumnsList: string[] | null = null;

function getItemStatements() {
    if (!itemUpdateStmt || !itemInsertStmt) {
        const validColumns = getValidItemsColumns();
        const allColumns = Array.from(validColumns);

        // UPDATE: exclude 'id' and 'added' to preserve original timestamp
        updateColumnsList = allColumns.filter(col => col !== 'id' && col !== 'added');
        const updateFields = updateColumnsList.map(col => `${col} = ?`).join(', ');
        itemUpdateStmt = db.prepare(`UPDATE items SET ${updateFields} WHERE id = ?`);

        // INSERT: exclude 'id' (auto-increment)
        insertColumnsList = allColumns.filter(col => col !== 'id');
        const insertFields = insertColumnsList.join(', ');
        const insertPlaceholders = insertColumnsList.map(() => '?').join(', ');
        itemInsertStmt = db.prepare(`INSERT INTO items (${insertFields}) VALUES (${insertPlaceholders})`);
    }
    return { itemUpdateStmt, itemInsertStmt, updateColumnsList, insertColumnsList };
}

export interface Item {
    id: number
    source: string
    missing_since: number | null
    file_hash: string | null
    title: string
    artist: string
    artist_credit: string | null
    artists: string | null
    artists_credit: string | null
    artist_sort: string | null
    artists_sort: string | null
    artists_ids: string | null
    album: string
    albumartist: string | null
    albumartist_credit: string | null
    albumartists: string | null
    albumartists_credit: string | null
    albumartist_sort: string | null
    albumartists_sort: string | null
    albumdisambig: string | null
    albumstatus: string | null
    albumtype: string | null
    albumtypes: string | null
    album_id: number | null
    acoustid_fingerprint: string | null
    acoustid_id: string | null
    arrangers: string | null
    arrangers_ids: string | null
    asin: string | null
    barcode: string | null
    bitdepth: number | null
    bitrate: number | null
    bitrate_mode: string | null
    bpm: number | null
    catalognum: string | null
    channels: number | null
    comments: string | null
    comp: number | null
    composer_sort: string | null
    composers: string | null
    composers_ids: string | null
    country: string | null
    day: number | null
    disc: number | null
    discogs_albumid: number | null
    discogs_artistid: number | null
    discogs_labelid: number | null
    disctitle: string | null
    disctotal: number | null
    encoder: string | null
    encoder_info: string | null
    encoder_settings: string | null
    format: string | null
    genres: string[] | null
    grouping: string | null
    subtitle: string | null
    initial_key: string | null
    isrc: string | null
    label: string | null
    language: string | null
    length: number | null
    lyricists: string | null
    lyricists_ids: string | null
    lyrics: string | null
    mb_albumartistid: string | null
    mb_albumartistids: string | null
    mb_albumid: string | null
    mb_artistid: string | null
    mb_artistids: string | null
    mb_releasegroupid: string | null
    mb_releasetrackid: string | null
    mb_trackid: string | null
    mb_workid: string | null
    media: string | null
    month: number | null
    mtime: number | null
    original_day: number | null
    original_month: number | null
    original_year: number | null
    path: string
    r128_album_gain: number | null
    r128_track_gain: number | null
    releasegroupdisambig: string | null
    release_group_title: string | null
    remixers: string | null
    remixers_ids: string | null
    rg_album_gain: number | null
    rg_album_peak: number | null
    rg_track_gain: number | null
    rg_track_peak: number | null
    samplerate: number | null
    script: string | null
    style: string | null
    track: number | null
    trackdisambig: string | null
    tracktotal: number | null
    work: string | null
    work_disambig: string | null
    year: number | null
    added: number
    [key: string]: any
    // Mark item for deletion. set it to the date it was marked for deletion, or true if the date is unknown. 
    marked_for_deletion?: number
}

export function getAllItems(): Item[] {
    try {
        const stmt = db.prepare(`
            SELECT *
            FROM items
            ORDER BY album_id, track
        `)
        const rows = stmt.all() as Record<string, any>[]
        return decodeRows(rows) as Item[]
    } catch (error) {
        console.error("Error fetching items:", error)
        return []
    }
}

export function getItemsPaginated(page: number = 0, pageSize: number = 50): Item[] {
    try {
        const offset = page * pageSize
        const stmt = db.prepare(`
            SELECT *
            FROM items
            ORDER BY album_id, track
            LIMIT ? OFFSET ?
        `)
        const rows = stmt.all(pageSize, offset) as Record<string, any>[]
        return decodeRows(rows) as Item[]
    } catch (error) {
        console.error("Error fetching paginated items:", error)
        return []
    }
}

// User-facing item listing for an album. Excludes soft-deleted items so the
// album detail view never shows tracks that the user moved to trash. Internal
// callers that need the full set (e.g. Repository.restoreAlbum, which needs
// to find items currently in trash) use {@link getAllItemsByAlbum}.
export function getItemsByAlbum(albumId: number): Item[] {
    try {
        const stmt = db.prepare(`
            SELECT *
            FROM items
            WHERE album_id = ?
              AND marked_for_deletion IS NULL
            ORDER BY track
        `)
        const rows = stmt.all(albumId) as Record<string, any>[]
        return decodeRows(rows) as Item[]
    } catch (error) {
        console.error("Error fetching items for album:", error)
        return []
    }
}

// Internal raw listing including soft-deleted items. Used by restore and by
// repository operations that need to see every row in the album.
export function getAllItemsByAlbum(albumId: number): Item[] {
    try {
        const stmt = db.prepare(`
            SELECT *
            FROM items
            WHERE album_id = ?
            ORDER BY track
        `)
        const rows = stmt.all(albumId) as Record<string, any>[]
        return decodeRows(rows) as Item[]
    } catch (error) {
        console.error("Error fetching all items for album:", error)
        return []
    }
}

export function getItemById(id: number): Item | null {
    try {
        const stmt = db.prepare(`
            SELECT *
            FROM items
            WHERE id = ?
        `)
        const row = stmt.get(id)
        return row ? decodeRow(row) as Item : null
    } catch (error) {
        console.error("Error fetching item:", error)
        return null
    }
}

export function getItemCount(): number {
    try {
        const result = db.prepare("SELECT COUNT(*) as count FROM items").get() as {
            count: number
        }
        return result.count
    } catch (error) {
        console.error("Error counting items:", error)
        return 0
    }
}

export function searchItems(query: string, page: number = 0, pageSize: number = 50): Item[] {
    try {
        const offset = page * pageSize

        // Use FTS5 for full-text search
        // Porter tokenizer handles stemming (legend→legends)
        // Unicode61 handles diacritics (á→a) and case folding
        const stmt = db.prepare(`
            SELECT items.*
            FROM items
            INNER JOIN items_fts ON items.id = items_fts.rowid
            WHERE items_fts MATCH ?
              AND items.marked_for_deletion IS NULL
            ORDER BY items.album_id, items.track
            LIMIT ? OFFSET ?
        `)

        const rows = stmt.all(query.trim(), pageSize, offset) as Record<string, any>[]
        return decodeRows(rows) as Item[]
    } catch (error) {
        console.error("Error searching items:", error)
        return []
    }
}

export function getItemsSearchCount(query: string): number {
    try {
        // Use FTS5 for full-text search
        const stmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM items
            INNER JOIN items_fts ON items.id = items_fts.rowid
            WHERE items_fts MATCH ?
              AND items.marked_for_deletion IS NULL
        `)

        const result = stmt.get(query.trim()) as { count: number }
        return result.count
    } catch (error) {
        console.error("Error counting search results:", error)
        return 0
    }
}

// An item is eligible for permanent hard delete only when there is nothing
// left to lose: the file is already gone (missing_since), or the user soft-
// deleted it and the configured retention window has elapsed. Any other state
// implies the user still has a recoverable copy in trash, so we must refuse.
function isHardDeleteEligible(row: { missing_since: number | null; marked_for_deletion: number | null }): boolean {
    if (row.missing_since != null) return true;
    if (row.marked_for_deletion != null) {
        const cutoffMs = globalConfig.delete_after * 24 * 60 * 60 * 1000;
        return Date.now() - row.marked_for_deletion > cutoffMs;
    }
    return false;
}

/**
 * Permanently remove an item row from the DB. Refuses to act unless the row
 * is hard-delete eligible (see {@link isHardDeleteEligible}). This is the
 * chokepoint that makes accidental hard delete impossible: any new caller
 * that uses this function on a live item will throw at runtime instead of
 * silently destroying data.
 *
 * Internal code paths that legitimately need to bypass this — adoption
 * rollback of a freshly-inserted row, admin-side dedupe — must use
 * {@link unsafeForceDeleteItemFromDB} and document the reason.
 */
export function deleteItemFromDB(id: number): void {
    try {
        const row = db
            .prepare(`SELECT missing_since, marked_for_deletion FROM items WHERE id = ?`)
            .get(id) as { missing_since: number | null; marked_for_deletion: number | null } | undefined;
        if (!row) return; // already gone — idempotent
        if (!isHardDeleteEligible(row)) {
            throw new Error(
                `Refusing to hard-delete item ${id}: not eligible ` +
                `(missing_since=${row.missing_since}, marked_for_deletion=${row.marked_for_deletion}, ` +
                `retention_days=${globalConfig.delete_after}). Soft-delete first via Repository.markItemForDeletion.`,
            );
        }
        db.prepare(`DELETE FROM items WHERE id = ?`).run(id);
    }
    catch (error) {
        console.error("Error deleting item:", error)
        throw error
    }
}

/**
 * Bypass the eligibility check. Reserved for code paths where the caller has
 * already proven the row should be deleted by other means:
 *   - adopt rollback: the row was just inserted and never published anywhere
 *   - admin dedupe: the user explicitly chose to merge duplicates
 *   - permanent-delete-of-missing-album: album.missing_since is set and the
 *     handler has verified every item is also missing
 *
 * Always log the reason — this is the audit trail for accidental data loss.
 */
export function unsafeForceDeleteItemFromDB(id: number, reason: string): void {
    console.warn(`unsafeForceDeleteItemFromDB(${id}): ${reason}`);
    db.prepare(`DELETE FROM items WHERE id = ?`).run(id);
}

/**
 * Find existing item using multi-tier duplicate detection
 * Priority: mb_trackid > file_hash > path
 */
function findExistingItem(item: Item): { id: number } | undefined {
    // Tier 1: MusicBrainz Track ID (most reliable)
    if (item.mb_trackid && globalConfig.duplicate_detection !== 'path') {
        const mbResult = db.prepare('SELECT id FROM items WHERE mb_trackid = ? AND mb_trackid IS NOT NULL')
            .get(item.mb_trackid) as { id: number } | undefined

        if (mbResult) {
            console.log(`Duplicate found by mb_trackid: ${item.mb_trackid}`)
            return mbResult
        }
    }

    // Tier 2: File hash (reliable for same content)
    if (item.file_hash && globalConfig.duplicate_detection !== 'path') {
        const hashResult = db.prepare('SELECT id FROM items WHERE file_hash = ? AND file_hash IS NOT NULL')
            .get(item.file_hash) as { id: number } | undefined

        if (hashResult) {
            console.log(`Duplicate found by file_hash: ${item.file_hash.substring(0, 16)}...`)
            return hashResult
        }
    }

    // Tier 3: Path (current behavior, least reliable)
    // D4: path is now TEXT, no Buffer conversion needed
    const pathResult = db.prepare('SELECT id FROM items WHERE path = ?')
        .get(item.path) as { id: number } | undefined

    if (pathResult) {
        console.log(`Duplicate found by path: ${item.path}`)
        return pathResult
    }

    // Tier 4: Same album + same (track, disc) OR same normalized title.
    // Catches re-imports of files that have no mb_trackid tag and arrive at
    // a new path (e.g. the same album re-downloaded into a different folder,
    // or the cluster matched two physical copies of one track to the same
    // album row). album_id is set by the caller before writeOrUpdateItem so
    // this tier is the safety net inside the cluster-resolved album.
    if (item.album_id != null && globalConfig.duplicate_detection !== 'path') {
        if (item.track != null) {
            const trackDiscResult = db.prepare(`
                SELECT id FROM items
                WHERE album_id = ? AND track = ?
                  AND ((disc IS NULL AND ? IS NULL) OR disc = ?)
            `).get(item.album_id, item.track, item.disc, item.disc) as { id: number } | undefined

            if (trackDiscResult) {
                console.log(`Duplicate found by (album_id, track, disc): album=${item.album_id} track=${item.track} disc=${item.disc ?? 'null'}`)
                return trackDiscResult
            }
        }

        if (item.title) {
            const titleResult = db.prepare(`
                SELECT id FROM items
                WHERE album_id = ?
                  AND LOWER(TRIM(title)) = LOWER(TRIM(?))
            `).get(item.album_id, item.title) as { id: number } | undefined

            if (titleResult) {
                console.log(`Duplicate found by (album_id, title): album=${item.album_id} title="${item.title}"`)
                return titleResult
            }
        }
    }

    return undefined
}

export function writeOrUpdateItem(item: Item): { action: 'inserted' | 'updated' | 'skipped'; id: number } {
    try {
        // Get valid columns from schema (cached)
        const validColumns = getValidItemsColumns();

        // Multi-tier duplicate detection
        const existing = findExistingItem(item)

        // Prepare item data for database - only include valid columns
        const dbItem: Record<string, any> = {}
        for (const key of Object.keys(item)) {
            if (validColumns.has(key)) {
                dbItem[key] = (item as any)[key]
            }
        }

        // Convert genres array to comma-separated string
        if (Array.isArray(dbItem.genres)) {
            dbItem.genres = dbItem.genres.join(', ')
        }

        // D4: path and artpath are now TEXT, no Buffer conversion needed

        if (existing) {
            // Duplicate found - check config for action
            if (globalConfig.duplicate_action === 'skip') {
                console.log(`Skipping duplicate: ${item.path} (matches existing id ${existing.id})`)
                return { action: 'skipped', id: existing.id }
            }

            // Overwrite mode: update existing item using pre-built statement (D2)
            const { itemUpdateStmt, updateColumnsList } = getItemStatements();
            const values = updateColumnsList!.map(col => dbItem[col] ?? null);
            values.push(existing.id); // WHERE id = ?
            itemUpdateStmt!.run(...values);
            console.log(`Updated duplicate: ${item.path} (existing id ${existing.id})`)
            return { action: 'updated', id: existing.id }
        } else {
            // Insert new item using pre-built statement (D2)
            const { itemInsertStmt, insertColumnsList } = getItemStatements();
            const values = insertColumnsList!.map(col => dbItem[col] ?? null);
            const result = itemInsertStmt!.run(...values);
            return { action: 'inserted', id: result.lastInsertRowid as number }
        }
    } catch (error) {
        console.error('Error writing/updating item:', error)
        throw error
    }
}

// Get all item paths from DB (for reconciliation)
// Uses iterate() instead of all() to avoid materializing all rows at once (D7)
// Returns paths the reconcile scanner is responsible for. Soft-deleted items
// are skipped — their paths now live under the trash subtree, which the
// scanner doesn't enumerate, so including them here would make every reconcile
// re-mark them as missing_since. They're handled by Repository.deleteItem
// (reaped after the retention window).
export function getAllItemPaths(musicDirectory?: string): Map<string, { id: number; album_id: number | null }> {
    try {
        const pathMap = new Map<string, { id: number; album_id: number | null }>()
        if (musicDirectory) {
            const musicDirNormalized = musicDirectory.endsWith('/') ? musicDirectory : musicDirectory + '/'
            const stmt = db.prepare(
                "SELECT id, path, album_id FROM items WHERE path LIKE ? || '%' AND marked_for_deletion IS NULL"
            )
            for (const row of stmt.iterate(musicDirNormalized) as IterableIterator<{ id: number; path: string; album_id: number | null }>) {
                pathMap.set(row.path, { id: row.id, album_id: row.album_id })
            }
        } else {
            const stmt = db.prepare("SELECT id, path, album_id FROM items WHERE marked_for_deletion IS NULL")
            for (const row of stmt.iterate() as IterableIterator<{ id: number; path: string; album_id: number | null }>) {
                pathMap.set(row.path, { id: row.id, album_id: row.album_id })
            }
        }
        return pathMap
    } catch (error) {
        console.error('Error fetching item paths:', error)
        return new Map()
    }
}

// Batch update items in a transaction
export function batchUpdateItems(updates: Array<{ id: number; fields: Partial<Item> }>): void {
    const transaction = db.transaction((updates: Array<{ id: number; fields: Partial<Item> }>) => {
        for (const { id, fields } of updates) {
            const fieldNames = Object.keys(fields).filter(key => key !== 'id')
            if (fieldNames.length === 0) continue

            const setClause = fieldNames.map(key => `${key} = ?`).join(', ')
            const values = fieldNames.map(key => {
                const v = (fields as any)[key];
                return Array.isArray(v) ? v.join(', ') : v;
            })

            const stmt = db.prepare(`UPDATE items SET ${setClause} WHERE id = ?`)
            stmt.run(...values, id)
        }
    })

    try {
        transaction(updates)
    } catch (error) {
        console.error('Error batch updating items:', error)
        throw error
    }
}

// Update a single item's fields
export function updateItem(id: number, fields: Partial<Item>): void {
    batchUpdateItems([{ id, fields }])
}

// Get items marked for deletion that are old enough to delete
export function getItemsReadyForDeletion(deleteAfterDays: number): Item[] {
    try {
        const cutoffTime = Date.now() - (deleteAfterDays * 24 * 60 * 60 * 1000)
        const stmt = db.prepare(`
            SELECT *
            FROM items
            WHERE marked_for_deletion IS NOT NULL
              AND marked_for_deletion < ?
        `)
        const rows = stmt.all(cutoffTime) as Record<string, any>[]
        return decodeRows(rows) as Item[]
    } catch (error) {
        console.error('Error fetching items ready for deletion:', error)
        return []
    }
}

// Batch delete items by IDs
export function batchDeleteItems(ids: number[]): void {
    if (ids.length === 0) return

    const transaction = db.transaction((ids: number[]) => {
        const placeholders = ids.map(() => '?').join(',')
        const stmt = db.prepare(`DELETE FROM items WHERE id IN (${placeholders})`)
        stmt.run(...ids)
    })

    try {
        transaction(ids)
    } catch (error) {
        console.error('Error batch deleting items:', error)
        throw error
    }
}
