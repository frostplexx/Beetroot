"use client"

import { Album } from "@/lib/music/database/index"
import { Music } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { useState } from "react"

function getAlbumArtUrl(albumId: number): string {
    return `/api/album-art/${albumId}?type=album`
}

export default function AlbumCard({ album }: { album: Album }) {
    const [imageError, setImageError] = useState(false)
    const artUrl = getAlbumArtUrl(album.id)

    return (
        <Link
            href={`/albums/${album.id}`}
            className="relative w-full aspect-square overflow-hidden rounded-lg bg-muted group border-2 border-transparent hover:border-accent transition-all cursor-pointer block"
        >
            {!imageError ? (
                <img
                    src={artUrl}
                    alt={album.album}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    onError={() => setImageError(true)}
                    crossOrigin="anonymous"
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted">
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
