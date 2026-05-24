import { getAlbumById, getItemsByAlbum } from "@/lib/music/database"
import { AlbumContent } from "./album-content"

export default async function AlbumPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const albumId = parseInt(id, 10)
    const album = getAlbumById(albumId)

    if (!album) {
        return (
            <div className="flex items-center justify-center h-screen">
                <p className="text-white/60">Album not found</p>
            </div>
        )
    }

    const artUrl = album.artpath && !album.missing_since ? `/api/album/${albumId}/art?size=800&t=${album.added}` : null
    const songs = getItemsByAlbum(albumId)

    return <AlbumContent album={album} artUrl={artUrl} songs={songs} />
}
