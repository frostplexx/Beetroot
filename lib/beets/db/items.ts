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

export function searchItems(query: string): Item[] {
    try {
        const stmt = db.prepare(`
            SELECT *
            FROM items
            WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?
            ORDER BY album_id, track
        `)
        const searchTerm = `%${query}%`
        const rows = stmt.all(searchTerm, searchTerm, searchTerm)
        return decodeRows(rows) as Item[]
    } catch (error) {
        console.error("Error searching items:", error)
        return []
    }
}
