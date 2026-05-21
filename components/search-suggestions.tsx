"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Album, Music, ArrowRight } from "lucide-react"
import Image from "next/image"
import type { Album as AlbumType, Item } from "@/lib/music/database/index"

interface SearchSuggestionsProps {
    albums: AlbumType[]
    tracks: Item[]
    query: string
    onClose: () => void
}

export function SearchSuggestions({ albums, tracks, query, onClose }: SearchSuggestionsProps) {
    const router = useRouter()
    const [failedImages, setFailedImages] = useState<Set<number>>(new Set())

    const handleAlbumClick = (albumId: number) => {
        onClose()
        router.push(`/albums/${albumId}`)
    }

    const handleViewAllClick = () => {
        onClose()
        router.push(`/?q=${encodeURIComponent(query)}`)
    }

    const hasResults = albums.length > 0 || tracks.length > 0

    if (!hasResults) {
        return (
            <div className="absolute top-full left-0 right-0 mt-2 rounded-lg bg-black border border-white/10 shadow-2xl overflow-hidden z-50">
                <div className="p-4 text-center text-white/60 text-sm">
                    No results found for "{query}"
                </div>
            </div>
        )
    }

    return (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-lg bg-black border border-white/10 shadow-2xl overflow-hidden z-50 max-h-[500px] overflow-y-auto">
            {/* Albums */}
            {albums.length > 0 && (
                <div className="p-2">
                    <div className="px-2 py-1 text-xs text-white/60 uppercase tracking-wider font-medium">
                        Albums
                    </div>
                    {albums.map((album) => (
                        <button
                            key={album.id}
                            onClick={() => handleAlbumClick(album.id)}
                            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-white/10 transition-all group"
                        >
                            <div className="flex-shrink-0 w-10 h-10 rounded bg-white/5 overflow-hidden relative flex items-center justify-center">
                                {!album.artpath || failedImages.has(album.id) ? (
                                    <Album className="w-5 h-5 text-white/60" />
                                ) : (
                                    <Image
                                        src={`/api/art?path=${encodeURIComponent(album.artpath)}&size=80`}
                                        alt={album.album}
                                        fill
                                        className="object-cover"
                                        sizes="40px"
                                        unoptimized
                                        onError={() => setFailedImages(prev => new Set(prev).add(album.id))}
                                    />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white truncate">
                                    {album.album}
                                </div>
                                <div className="text-xs text-white/60 truncate">
                                    {album.albumartist} {album.year && `• ${album.year}`}
                                </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-white/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    ))}
                </div>
            )}

            {/* Tracks */}
            {tracks.length > 0 && (
                <div className="p-2 border-t border-white/10">
                    <div className="px-2 py-1 text-xs text-white/60 uppercase tracking-wider font-medium">
                        Tracks
                    </div>
                    {tracks.map((track) => (
                        <button
                            key={track.id}
                            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-white/10 transition-all group"
                        >
                            <div className="flex-shrink-0 w-10 h-10 rounded bg-white/5 flex items-center justify-center">
                                <Music className="w-5 h-5 text-white/60" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white truncate">
                                    {track.title}
                                </div>
                                <div className="text-xs text-white/60 truncate">
                                    {track.artist} • {track.album}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* View All Results */}
            <button
                onClick={handleViewAllClick}
                className="w-full px-4 py-3 text-sm font-medium text-purple-200 bg-purple-500/10 hover:bg-purple-500/20 border-t border-purple-400/20 transition-all flex items-center justify-center gap-2"
            >
                View all results for "{query}"
                <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    )
}
