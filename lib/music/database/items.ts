import db from "./db"
import { decodeRows, decodeRow } from "./utils"

export interface Item {
    id: number
    source: string
    missing_since: number | null
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
