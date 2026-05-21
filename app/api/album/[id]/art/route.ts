import { NextRequest } from "next/server"
import { getAlbumById } from "@/lib/music/database/albums"
import { serveArtFromPath, notFoundArt } from "@/lib/api/serve-art"

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
        return notFoundArt()
    }

    const size = request.nextUrl.searchParams.get("size")
    return serveArtFromPath(request, album.artpath, size)
}
