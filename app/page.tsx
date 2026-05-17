import {
    getAlbumsPaginated,
    getAlbumCount,
    searchAlbums,
    getAlbumsSearchCount,
} from "@/lib/music/database/index"
import {
    getItemsPaginated,
    getItemCount,
    searchItems,
    getItemsSearchCount,
} from "@/lib/music/database/index"
import { LibraryClient } from "./library-client"

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function Home({ searchParams }: PageProps) {
    const params = await searchParams
    const albumsPage = Number(params.albumsPage) || 0
    const tracksPage = Number(params.tracksPage) || 0
    const query = typeof params.q === 'string' ? params.q : ''

    const albumsPerPage = 24
    const tracksPerPage = 50

    const isSearching = query.length > 0

    // Fetch data based on whether we're searching or not
    const albums = isSearching
        ? searchAlbums(query, albumsPage, albumsPerPage)
        : getAlbumsPaginated(albumsPage, albumsPerPage)

    const totalAlbums = isSearching
        ? getAlbumsSearchCount(query)
        : getAlbumCount()

    const tracks = isSearching
        ? searchItems(query, tracksPage, tracksPerPage)
        : getItemsPaginated(tracksPage, tracksPerPage)

    const totalTracks = isSearching
        ? getItemsSearchCount(query)
        : getItemCount()

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
            searchQuery={query}
        />
    )
}
