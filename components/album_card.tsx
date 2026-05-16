"use client"

import { Album } from "@/lib/beets/db"
import { Music } from "lucide-react"
import Link from "next/link"

function getAlbumArtUrl(artpath: string | null): string {
    if (!artpath) {
        return "/placeholder-album.png"
    }
    return `/api/art?path=${encodeURIComponent(artpath)}`
}

export default function AlbumCard({ album }: { album: Album }) {
    const artUrl = album.artpath ? getAlbumArtUrl(album.artpath) : null

    return (
        <Link
            href={`/albums/${album.id}`}
            className="relative w-full aspect-square overflow-hidden rounded-lg bg-muted group border-2 border-transparent hover:border-accent transition-all cursor-pointer block"
        >
            {artUrl ? (
                <img
                    src={artUrl}
                    alt={album.album}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center">
                    <Music className="w-12 h-12 text-muted-foreground" />
                </div>
            )}

            {/* Text overlay with gradient background */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 via-black/5 to-transparent p-3">
                <h3 className="text-white font-semibold text-sm line-clamp-1 drop-shadow-lg">
                    {album.album}
                </h3>
                <p className="text-white/90 text-xs line-clamp-1 drop-shadow-lg">
                    {album.albumartist}
                </p>
            </div>
        </Link>
    )
}
