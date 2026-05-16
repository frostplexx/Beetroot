import db from "@/lib/db"
import { decodeRows, decodeRow } from "./utils"

export interface Item {
    id: number
    title: string
    artist: string
    album: string
    album_id: number
    track: number | null
    year: number | null
    path: string
    length: number | null
    [key: string]: any
}

export function getAllItems(): Item[] {
    try {
        const stmt = db.prepare(`
            SELECT *
            FROM items
            ORDER BY album_id, track
        `)
        const rows = stmt.all()
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
        const rows = stmt.all(pageSize, offset)
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
        const rows = stmt.all(albumId)
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
        params.push(pageSize, offset)

        const rows = stmt.all(...params)
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
