import { NextRequest, NextResponse } from 'next/server'
import { promises as fsp } from 'fs'
import * as path from 'path'
import db from '@/lib/music/database/db'
import { decodeBuffer } from '@/lib/music/database/utils'
import { serveArtFromPath, notFoundArt } from '@/lib/api/serve-art'

// Prepared statements are hoisted so we don't re-parse the SQL on every request.
const selectAlbumArt = db.prepare('SELECT artpath FROM albums WHERE id = ?')
const selectItemArtAndPath = db.prepare('SELECT artpath, path FROM items WHERE id = ?')

const COVER_FILENAMES = ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png']

async function findCoverInFolder(folder: string): Promise<string | null> {
    // Probe candidates in parallel — most albums hit on the first or none at all.
    const checks = await Promise.all(
        COVER_FILENAMES.map(async (name) => {
            const p = path.join(folder, name)
            try {
                await fsp.access(p)
                return p
            } catch {
                return null
            }
        }),
    )
    return checks.find((p): p is string => p !== null) ?? null
}

/**
 * GET /api/album-art/[id]?type=album|track&size=NNN
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id: rawId } = await params
        const id = parseInt(rawId, 10)
        if (!Number.isFinite(id)) return notFoundArt()

        const type = request.nextUrl.searchParams.get('type') || 'album'
        const sizeParam = request.nextUrl.searchParams.get('size')

        let artpath: string | null = null

        if (type === 'album') {
            const row = selectAlbumArt.get(id) as { artpath: unknown } | undefined
            artpath = row?.artpath ? decodeBuffer(row.artpath) : null
        } else if (type === 'track') {
            const row = selectItemArtAndPath.get(id) as
                | { artpath: unknown; path: unknown }
                | undefined
            artpath = row?.artpath ? decodeBuffer(row.artpath) : null

            if (!artpath && row?.path) {
                const itemPath = decodeBuffer(row.path)
                if (itemPath) {
                    artpath = await findCoverInFolder(path.dirname(itemPath))
                }
            }
        }

        if (!artpath) return notFoundArt()

        return await serveArtFromPath(request, artpath, sizeParam)
    } catch (error) {
        console.error('Album art error:', error)
        return new NextResponse(null, { status: 500 })
    }
}
