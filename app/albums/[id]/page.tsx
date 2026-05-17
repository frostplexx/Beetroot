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
    const artUrl = album.artpath
        ? `/api/art?path=${encodeURIComponent(album.artpath)}`
        : null

    return <AlbumPageClient album={album} artUrl={artUrl} tracks={tracks} />
}
