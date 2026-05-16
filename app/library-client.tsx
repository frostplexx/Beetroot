"use client"

import { useRouter, useSearchParams } from "next/navigation"
import AlbumCard from "@/components/album_card"
import { TabsContent, TabsList, TabsTrigger, Tabs } from "@/components/ui/tabs"
import { Album, Music, ChevronLeft, ChevronRight } from "lucide-react"
import { TracksTable } from "./tracks-table"
import { tracksColumns } from "./tracks-columns"
import type { Album as AlbumType, Item } from "@/lib/beets/db"

interface LibraryClientProps {
    albums: AlbumType[]
    tracks: Item[]
    totalAlbums: number
    totalTracks: number
    albumsPage: number
    tracksPage: number
    totalAlbumPages: number
    totalTrackPages: number
}

export function LibraryClient({
    albums,
    tracks,
    totalAlbums,
    totalTracks,
    albumsPage,
    tracksPage,
    totalAlbumPages,
    totalTrackPages,
}: LibraryClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const handleAlbumsPageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('albumsPage', newPage.toString())
        router.push(`/?${params.toString()}`)
    }

    const handleTracksPageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tracksPage', newPage.toString())
        router.push(`/?${params.toString()}`)
    }

    const renderPagination = (currentPage: number, totalPages: number, onPageChange: (page: number) => void) => {
        if (totalPages <= 1) return null

        return (
            <div className="flex items-center justify-center gap-2 mt-8">
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 0}
                    className="p-2 rounded-lg bg-white/10 border border-white/20 text-white transition-all hover:bg-white/20 hover:border-white/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/10"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum
                        if (totalPages <= 5) {
                            pageNum = i
                        } else if (currentPage < 3) {
                            pageNum = i
                        } else if (currentPage > totalPages - 3) {
                            pageNum = totalPages - 5 + i
                        } else {
                            pageNum = currentPage - 2 + i
                        }

                        const isActive = pageNum === currentPage

                        return (
                            <button
                                key={pageNum}
                                onClick={() => onPageChange(pageNum)}
                                className={`min-w-9 h-9 px-2 rounded-lg text-sm font-medium transition-all ${
                                    isActive
                                        ? 'bg-white/20 text-white border border-white/30'
                                        : 'text-white/70 hover:text-white hover:bg-white/10'
                                }`}
                            >
                                {pageNum + 1}
                            </button>
                        )
                    })}
                </div>

                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages - 1}
                    className="p-2 rounded-lg bg-white/10 border border-white/20 text-white transition-all hover:bg-white/20 hover:border-white/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/10"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        )
    }

    return (
        <div className="container mx-auto py-4 px-4">
            <Tabs defaultValue="albums">
                {/* Tabs & Results Count */}
                <div className="flex items-center justify-between mb-4">
                    <TabsList className="bg-transparent border-b" variant="line">
                        <TabsTrigger value="albums">
                            <Album className="w-4 h-4" />
                            Albums
                        </TabsTrigger>
                        <TabsTrigger value="tracks">
                            <Music className="w-4 h-4" />
                            Tracks
                        </TabsTrigger>
                    </TabsList>

                    <div className="text-sm text-white/60">
                        {totalAlbums.toLocaleString()} albums • {totalTracks.toLocaleString()} tracks
                    </div>
                </div>

                <TabsContent value="albums" className="mt-0">
                    {/* Album Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                        {albums.map((album) => (
                            <AlbumCard key={album.id} album={album} />
                        ))}
                    </div>

                    {/* Pagination */}
                    {renderPagination(albumsPage, totalAlbumPages, handleAlbumsPageChange)}
                </TabsContent>

                <TabsContent value="tracks" className="mt-0">
                    <TracksTable
                        columns={tracksColumns}
                        data={tracks}
                        currentPage={tracksPage}
                        totalPages={totalTrackPages}
                        onPageChange={handleTracksPageChange}
                    />
                </TabsContent>
            </Tabs>
        </div>
    )
}
