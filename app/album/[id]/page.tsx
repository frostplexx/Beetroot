import { getAlbumById, getItemsByAlbum, Item } from "@/lib/music/database"
import { ChevronLeft } from "lucide-react"
import Link from "next/link"
import AlbumArtwork from "@/components/album-artwork"
import DynamicBackground from "@/components/dynamic-background"
import { SongsDataTable } from "./data-table"
import { columns } from "./columns"
import { EditDialog } from "./edit-dialog"

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
    const totalMinutes = album.total_time ? Math.round(album.total_time / 60) : 0
    const genres = album.genres?.split(",").map(g => g.trim()).filter(Boolean) || []

    return (
        <div className="w-full relative flex flex-col overflow-hidden">
            <DynamicBackground artUrl={artUrl} />
            <div className="relative flex-1">
                <div className="container mx-auto px-4 py-6">
                    <Link
                        href="/"
                        transitionTypes={['nav-back']}
                        className="inline-flex items-center gap-1.5 py-2 px-3 rounded-lg bg-white/10 border border-white/20 backdrop-blur-sm text-sm text-white hover:bg-white/20 hover:border-white/30 hover:scale-105 transition-all group"
                    >
                        <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                        Back
                    </Link>

                    <div className="flex flex-col md:flex-row gap-8 items-start mt-8">
                        <AlbumArtwork
                            artUrl={artUrl}
                            album={`${album.album} by ${album.albumartist}`}
                            albumId={albumId}
                            missingSince={album.missing_since}
                        />

                        <div className="flex-1 flex flex-col justify-start gap-4">
                            <div className="flex items-start justify-between gap-4">
                                <h1 className="font-heading text-4xl md:text-5xl font-black leading-none tracking-tight">
                                    {album.album}
                                </h1>
                                <EditDialog album={album} image={artUrl}/>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-base">
                                <span>{album.albumartist}</span>
                                {album.year && (
                                    <>
                                        <span className="text-white/40">•</span>
                                        <span>{album.year}</span>
                                    </>
                                )}
                                {album.total_tracks && (
                                    <>
                                        <span className="text-white/40">•</span>
                                        <span>{album.total_tracks} songs</span>
                                    </>
                                )}
                                {totalMinutes > 0 && (
                                    <>
                                        <span className="text-white/40">•</span>
                                        <span>{totalMinutes} min</span>
                                    </>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-4">
                                {album.country && (
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] uppercase tracking-wider text-white/60 font-medium">
                                            Country
                                        </label>
                                        <span className="text-xs font-semibold">{album.country}</span>
                                    </div>
                                )}
                                {album.label && (
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] uppercase tracking-wider text-white/60 font-medium">
                                            Label
                                        </label>
                                        <span className="text-xs font-semibold">{album.label}</span>
                                    </div>
                                )}
                            </div>

                            {genres.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {genres.map((genre) => (
                                        <span
                                            key={genre}
                                            className="py-1 px-2.5 bg-white/15 border border-white/20 backdrop-blur-sm rounded-full text-xs font-medium hover:bg-white/25 hover:scale-105 transition-all"
                                        >
                                            {genre}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                    <div className="mt-12 pb-6">
                        <SongsDataTable columns={columns} data={getItemsByAlbum(albumId)} totalTracks={album.total_tracks}/>
                    </div>
                </div>
            </div>
        </div>
    )
}
