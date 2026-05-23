import { NextRequest } from "next/server"
import { getAlbumById } from "@/lib/music/database/albums"
import { serveArtFromPath, notFoundArt } from "@/lib/api/serve-art"
import { verifyAlbumPresence } from "@/lib/music/repository/verify-album"

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const albumId = parseInt(id, 10)

    if (!Number.isFinite(albumId) || albumId <= 0) {
        return notFoundArt()
    }

    const album = getAlbumById(albumId)
    if (!album || !album.artpath) {
        if (album) void verifyAlbumPresence(albumId)
        return notFoundArt()
    }

    const size = request.nextUrl.searchParams.get("size")
    const response = await serveArtFromPath(request, album.artpath, size)
    // Cover file gone from disk — likely the whole album moved/was deleted.
    // Fire-and-forget verify so the missing flag gets reconciled without
    // waiting for the next full library scan.
    if (response.status === 404) void verifyAlbumPresence(albumId)
    return response
}
