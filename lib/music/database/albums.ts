import db from "./db"
import { decodeRows, decodeRow } from "./utils"

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
        const searchTerms = query.trim().split(/\s+/).map(term => `%${term}%`)

        // Build dynamic WHERE clause for fuzzy matching
        const whereConditions = searchTerms.map(() =>
            '(album LIKE ? OR albumartist LIKE ? OR label LIKE ? OR genres LIKE ?)'
        ).join(' AND ')

        const stmt = db.prepare(`
            SELECT *
            FROM albums
            WHERE ${whereConditions}
            ORDER BY added DESC
            LIMIT ? OFFSET ?
        `)

        // Flatten search terms for each condition
        const params = searchTerms.flatMap(term => [term, term, term, term])
        params.push(`${pageSize}`, `${offset}`)

        const rows = stmt.all(...params) as Record<string, any>[]
        return decodeRows(rows) as Album[]
    } catch (error) {
        console.error("Error searching albums:", error)
        return []
    }
}

export function getAlbumsSearchCount(query: string): number {
    try {
        const searchTerms = query.trim().split(/\s+/).map(term => `%${term}%`)
        const whereConditions = searchTerms.map(() =>
            '(album LIKE ? OR albumartist LIKE ? OR label LIKE ? OR genres LIKE ?)'
        ).join(' AND ')

        const stmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM albums
            WHERE ${whereConditions}
        `)

        const params = searchTerms.flatMap(term => [term, term, term, term])
        const result = stmt.get(...params) as { count: number }
        return result.count
    } catch (error) {
        console.error("Error counting search results:", error)
        return 0
    }
}

export function writeOrUpdateAlbum(album: Album): number {
    try {
        // Get valid columns from schema
        const columns = db.prepare('PRAGMA table_info(albums)').all() as Array<{ name: string }>
        const validColumns = new Set(columns.map(c => c.name))

        // Check if album exists - prefer mb_albumid, fallback to album+albumartist
        let existing: { id: number } | undefined
        if (album.mb_albumid) {
            existing = db.prepare('SELECT id FROM albums WHERE mb_albumid = ?').get(album.mb_albumid) as { id: number } | undefined
        }
        if (!existing) {
            existing = db.prepare('SELECT id FROM albums WHERE album = ? AND albumartist = ?').get(album.album, album.albumartist) as { id: number } | undefined
        }

        // Prepare album data for database - only include valid columns
        const dbAlbum: Record<string, any> = {}
        for (const key of Object.keys(album)) {
            if (validColumns.has(key)) {
                dbAlbum[key] = (album as any)[key]
            }
        }

        // Convert artpath to Buffer if present
        if (typeof dbAlbum.artpath === 'string') {
            dbAlbum.artpath = Buffer.from(dbAlbum.artpath, 'utf8')
        }

        if (existing) {
            // Update existing album
            const fields = Object.keys(dbAlbum)
                .filter(key => key !== 'id') // Don't update id
                .map(key => `${key} = ?`)
                .join(', ')

            const values = Object.keys(dbAlbum)
                .filter(key => key !== 'id')
                .map(key => dbAlbum[key])

            const stmt = db.prepare(`UPDATE albums SET ${fields} WHERE id = ?`)
            stmt.run(...values, existing.id)
            return existing.id
        } else {
            // Insert new album (exclude id, let it auto-increment)
            const insertFields = Object.keys(dbAlbum).filter(key => key !== 'id')
            const fields = insertFields.join(', ')
            const placeholders = insertFields.map(() => '?').join(', ')
            const values = insertFields.map(key => dbAlbum[key])

            const stmt = db.prepare(`INSERT INTO albums (${fields}) VALUES (${placeholders})`)
            const result = stmt.run(...values)
            return result.lastInsertRowid as number
        }
    } catch (error) {
        console.error('Error writing/updating album:', error)
        throw error
    }
}
