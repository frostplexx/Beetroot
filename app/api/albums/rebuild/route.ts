import { NextResponse } from 'next/server'
import db from '@/lib/music/database/db'

interface AlbumGroup {
    album: string
    albumartist: string
    year: number | null
    month: number | null
    day: number | null
    label: string | null
    mb_albumid: string | null
    mb_releasegroupid: string | null
    country: string | null
    albumtype: string | null
    artpath: string | null
    genres: string | null
    track_count: number
}

const selectAlbumGroups = db.prepare(`
    SELECT
        album,
        albumartist,
        MIN(year) AS year,
        MIN(month) AS month,
        MIN(day) AS day,
        MIN(label) AS label,
        MIN(mb_albumid) AS mb_albumid,
        MIN(mb_releasegroupid) AS mb_releasegroupid,
        MIN(country) AS country,
        MIN(albumtype) AS albumtype,
        MIN(artpath) AS artpath,
        MIN(genres) AS genres,
        COUNT(*) AS track_count
    FROM items
    WHERE album IS NOT NULL AND albumartist IS NOT NULL
    GROUP BY album, albumartist
`)

const selectExistingAlbum = db.prepare(`
    SELECT id FROM albums WHERE album = ? AND albumartist = ?
`)

const updateAlbum = db.prepare(`
    UPDATE albums SET
        year = COALESCE(year, ?),
        month = COALESCE(month, ?),
        day = COALESCE(day, ?),
        label = COALESCE(label, ?),
        mb_albumid = COALESCE(mb_albumid, ?),
        mb_releasegroupid = COALESCE(mb_releasegroupid, ?),
        country = COALESCE(country, ?),
        albumtype = COALESCE(albumtype, ?),
        artpath = COALESCE(artpath, ?),
        genres = COALESCE(genres, ?)
    WHERE id = ?
`)

const insertAlbum = db.prepare(`
    INSERT INTO albums (
        album, albumartist,
        year, month, day,
        label,
        mb_albumid, mb_releasegroupid,
        country, albumtype, artpath, genres,
        added
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const linkTracks = db.prepare(`
    UPDATE items SET album_id = ?
    WHERE album = ? AND albumartist = ?
`)

// One transaction for the whole rebuild — better-sqlite3 commits at the end,
// which is orders of magnitude faster than committing per-album.
const rebuildAll = db.transaction((groups: AlbumGroup[]) => {
    let created = 0
    let updated = 0
    const now = Date.now()

    for (const g of groups) {
        const existing = selectExistingAlbum.get(g.album, g.albumartist) as
            | { id: number }
            | undefined

        if (existing) {
            updateAlbum.run(
                g.year, g.month, g.day,
                g.label,
                g.mb_albumid, g.mb_releasegroupid,
                g.country, g.albumtype, g.artpath, g.genres,
                existing.id,
            )
            linkTracks.run(existing.id, g.album, g.albumartist)
            updated++
        } else {
            const result = insertAlbum.run(
                g.album, g.albumartist,
                g.year, g.month, g.day,
                g.label,
                g.mb_albumid, g.mb_releasegroupid,
                g.country, g.albumtype, g.artpath, g.genres,
                now,
            )
            linkTracks.run(Number(result.lastInsertRowid), g.album, g.albumartist)
            created++
        }
    }

    return { created, updated }
})

/**
 * POST /api/albums/rebuild — rebuilds the albums table from the tracks table.
 * Cover-art discovery on disk is intentionally left to the reconcile service;
 * doing per-album filesystem probes here serialized the whole endpoint.
 */
export async function POST() {
    try {
        const groups = selectAlbumGroups.all() as AlbumGroup[]
        const { created, updated } = rebuildAll(groups)

        return NextResponse.json({
            success: true,
            created,
            updated,
            total: created + updated,
        })
    } catch (error) {
        console.error('Rebuild albums error:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Rebuild failed' },
            { status: 500 },
        )
    }
}
