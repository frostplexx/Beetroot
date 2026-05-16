import { getAllAlbums, getAlbumCount } from "@/lib/beets/db"
import AlbumCard from "@/components/album_card"

export default function Home() {
    const albums = getAllAlbums()
    const totalAlbums = getAlbumCount()

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {albums.map((album) => (
                    <AlbumCard key={album.id} album={album} />
                ))}
            </div>
        </div>
    )
}
