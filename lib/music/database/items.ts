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

export function getItemsByAlbum(albumId: number): Item[] {
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
        console.error("Error fetching items for album:", error)
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
        const searchTerms = query.trim().split(/\s+/).map(term => `%${term}%`)

        // Build dynamic WHERE clause for fuzzy matching
        const whereConditions = searchTerms.map(() =>
            '(title LIKE ? OR artist LIKE ? OR album LIKE ?)'
        ).join(' AND ')

        const stmt = db.prepare(`
            SELECT *
            FROM items
            WHERE ${whereConditions}
            ORDER BY album_id, track
            LIMIT ? OFFSET ?
        `)

        // Flatten search terms for each condition
        const params = searchTerms.flatMap(term => [term, term, term])
        params.push(`${pageSize}`, `${offset}`)

        const rows = stmt.all(...params) as Record<string, any>[]
        return decodeRows(rows) as Item[]
    } catch (error) {
        console.error("Error searching items:", error)
        return []
    }
}

export function getItemsSearchCount(query: string): number {
    try {
        const searchTerms = query.trim().split(/\s+/).map(term => `%${term}%`)
        const whereConditions = searchTerms.map(() =>
            '(title LIKE ? OR artist LIKE ? OR album LIKE ?)'
        ).join(' AND ')

        const stmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM items
            WHERE ${whereConditions}
        `)

        const params = searchTerms.flatMap(term => [term, term, term])
        const result = stmt.get(...params) as { count: number }
        return result.count
    } catch (error) {
        console.error("Error counting search results:", error)
        return 0
    }
}

export function deleteItemFromDB(id: number): void {
    try {
        const stmt = db.prepare(`
            DELETE FROM items
            WHERE id = ?
        `)
        stmt.run(id)
    }
    catch (error) {
        console.error("Error deleting item:", error)
        throw error
    }
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
export function getAllItemPaths(musicDirectory?: string): Map<string, { id: number; album_id: number | null }> {
    try {
        let sql = 'SELECT id, path, album_id FROM items'
        let stmt: ReturnType<typeof db.prepare>

        if (musicDirectory) {
            // Filter in SQL using substr to match path prefix
            // Add trailing '/' to musicDirectory to avoid matching similar paths
            // (e.g., /Music should not match /MusicVideos)
            const musicDirNormalized = musicDirectory.endsWith('/') ? musicDirectory : musicDirectory + '/'

            // D4: path is now TEXT, use LIKE for prefix matching
            sql = 'SELECT id, path, album_id FROM items WHERE path LIKE ? || \'%\''
            stmt = db.prepare(sql)
            const pathMap = new Map<string, { id: number; album_id: number | null }>()
            for (const row of stmt.iterate(musicDirNormalized) as IterableIterator<{ id: number; path: string; album_id: number | null }>) {
                pathMap.set(row.path, { id: row.id, album_id: row.album_id })
            }
            return pathMap
        } else {
            stmt = db.prepare(sql)
            const pathMap = new Map<string, { id: number; album_id: number | null }>()
            for (const row of stmt.iterate() as IterableIterator<{ id: number; path: string; album_id: number | null }>) {
                pathMap.set(row.path, { id: row.id, album_id: row.album_id })
            }
            return pathMap
        }
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
            const values = fieldNames.map(key => (fields as any)[key])

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
