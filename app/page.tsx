import { getAllAlbums, getAlbumCount } from "@/lib/beets/db"
import { getAllItems, getItemCount } from "@/lib/beets/db"
import AlbumCard from "@/components/album_card"
import { TabsContent, TabsList, TabsTrigger, Tabs } from "@/components/ui/tabs"
import { Album, Music, ChevronLeft, ChevronRight } from "lucide-react"
import { TracksTable } from "./tracks-table"
import { tracksColumns } from "./tracks-columns"

export default function Home() {
    const albums = getAllAlbums()
    const totalAlbums = getAlbumCount()
    const tracks = getAllItems()
    const totalTracks = getItemCount()

    // Pagination (placeholder - make this dynamic later)
    const itemsPerPage = 24
    const currentPage = 1
    const totalPages = Math.ceil(albums.length / itemsPerPage)
    const paginatedAlbums = albums.slice(0, itemsPerPage)

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
                        {paginatedAlbums.map((album) => (
                            <AlbumCard key={album.id} album={album} />
                        ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-8">
                            <button
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg bg-white/10 border border-white/20 text-white transition-all hover:bg-white/20 hover:border-white/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/10"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>

                            <div className="flex items-center gap-1">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    const pageNum = i + 1
                                    const isActive = pageNum === currentPage

                                    return (
                                        <button
                                            key={pageNum}
                                            className={`min-w-9 h-9 px-2 rounded-lg text-sm font-medium transition-all ${
                                                isActive
                                                    ? 'bg-white/20 text-white border border-white/30'
                                                    : 'text-white/70 hover:text-white hover:bg-white/10'
                                            }`}
                                        >
                                            {pageNum}
                                        </button>
                                    )
                                })}
                            </div>

                            <button
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-lg bg-white/10 border border-white/20 text-white transition-all hover:bg-white/20 hover:border-white/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/10"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="tracks" className="mt-0">
                    <TracksTable columns={tracksColumns} data={tracks} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
