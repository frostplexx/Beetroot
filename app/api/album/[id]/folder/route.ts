import { NextRequest, NextResponse } from "next/server"
import { getItemsByAlbum } from "@/lib/music/database"
import * as path from "path"

export const dynamic = "force-dynamic"

// Returns the album's on-disk folder, derived from any item's path. Used by
// the album right-click menu so "Copy folder path" doesn't need a separate
// round-trip through the items API.
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const albumId = parseInt(id, 10)
    if (!Number.isFinite(albumId) || albumId <= 0) {
        return NextResponse.json({ error: "Invalid album id" }, { status: 400 })
    }

    const items = getItemsByAlbum(albumId)
    const withPath = items.find(i => i.path)
    if (!withPath) {
        return NextResponse.json({ error: "No items for album" }, { status: 404 })
    }

    return NextResponse.json({ folder: path.dirname(withPath.path) })
}
