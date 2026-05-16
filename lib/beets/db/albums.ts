import db from "@/lib/db"
import { decodeRows, decodeRow } from "./utils"

export interface Album {
    id: number
    album: string
    albumartist: string
    year: number | null
    artpath: string | null
    added: number
    albumtotal: number
    path: string | null
    label: string | null
    genres: string | null
    country: string | null
    [key: string]: any
}

export function getAllAlbums(): Album[] {
    try {
        const stmt = db.prepare(`
            SELECT *
            FROM albums
            ORDER BY added DESC
        `)
        const rows = stmt.all()
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
        const rows = stmt.all(pageSize, offset)
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
        params.push(pageSize, offset)

        const rows = stmt.all(...params)
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
