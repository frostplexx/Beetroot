import { getAlbumsPaginated, getAlbumCount } from "@/lib/beets/db"
import { getItemsPaginated, getItemCount } from "@/lib/beets/db"
import { LibraryClient } from "./library-client"

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function Home({ searchParams }: PageProps) {
    const params = await searchParams
    const albumsPage = Number(params.albumsPage) || 0
    const tracksPage = Number(params.tracksPage) || 0

    const albumsPerPage = 24
    const tracksPerPage = 50

    const albums = getAlbumsPaginated(albumsPage, albumsPerPage)
    const totalAlbums = getAlbumCount()
    const tracks = getItemsPaginated(tracksPage, tracksPerPage)
    const totalTracks = getItemCount()

    const totalAlbumPages = Math.ceil(totalAlbums / albumsPerPage)
    const totalTrackPages = Math.ceil(totalTracks / tracksPerPage)

    return (
        <LibraryClient
            albums={albums}
            tracks={tracks}
            totalAlbums={totalAlbums}
            totalTracks={totalTracks}
            albumsPage={albumsPage}
            tracksPage={tracksPage}
            totalAlbumPages={totalAlbumPages}
            totalTrackPages={totalTrackPages}
        />
    )
}
