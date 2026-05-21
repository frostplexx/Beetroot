import { getAlbumById } from "@/lib/music/database"
import Image from "next/image"
import { ViewTransition } from "react"

export default async function AlbumPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const albumId = parseInt(id, 10)
    const album = getAlbumById(albumId)

    const artUrl = `/api/album/${albumId}/art?size=800`

    if (!album) {
        return <div>Album not found</div>
    }

    return (
        <div className="flex flex-col items-center m-20">
            <div className="flex flex-row gap-8 ">
                <ViewTransition name={`album-${album.id}`}>
                    <Image 
                        src={artUrl} 
                        alt={`${album.album} by ${album.albumartist}`} 
                        className="mb-4 h-75 w-75 object-cover rounded-xl"
                        width={800}
                        height={800}
                    />
                </ViewTransition>
                <div className="flex flex-col gap-2 mt-4">
                    <h1 className="font-heading text-4xl font-semibold">{album.album}</h1>
                    <p className="text-lg text-gray-600">{album.albumartist}</p>
                    <p className="text-sm text-gray-500">{album.year}</p>
                </div>
            </div>
        </div>
    )
}
