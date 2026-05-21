import { getAlbumById, getItemsByAlbum } from "@/lib/music/database/index"
import { notFound } from "next/navigation"
import { DataTable } from "./data-table"
import { columns } from "./columns"
import { AlbumPageClient } from "./page-client"

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function AlbumPage({ params }: PageProps) {
    const { id } = await params
    const album = getAlbumById(parseInt(id))

    if (!album) {
        notFound()
    }

    const tracks = getItemsByAlbum(album.id)
    // Request a downsized image. The card displays at ~288px (md:w-72) and
    // doubling that covers 2x DPI screens; color extraction works fine on it.
    const artUrl = album.artpath
        ? `/api/art?path=${encodeURIComponent(album.artpath)}&size=600`
        : null

    return <AlbumPageClient album={album} artUrl={artUrl} tracks={tracks} />
}
