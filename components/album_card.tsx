import { Album } from "@/lib/music/database"
import Link from "next/link"
import { Music2 } from "lucide-react"
import { cn } from "@/lib/ui/utils"
import Image from "next/image";
import { ViewTransition } from "react";

export default function AlbumCard({ album, className }: { album: Album; className?: string }) {
    const artUrl = `/api/album/${album.id}/art?size=400&t=${album.added}`

    return (
        <Link
            href={`/album/${album.id}`}
            transitionTypes={['nav-forward']}
            className={cn("group block overflow-hidden rounded-xl transition-all duration-200 hover:scale-102", className)}
        >
            <div className="relative aspect-square w-full overflow-hidden bg-white/5">
                {album.artpath ? (
                    <ViewTransition name={`album-${album.id}`} share="morph">
                        <Image
                            src={artUrl}
                            alt={`${album.album} by ${album.albumartist}`}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105 rounded-xl shadow-2xl ring-1 ring-white/10"
                            width={400}
                            loading="eager"
                            height={400}
                        />
                    </ViewTransition>
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/40 rounded-xl">
                        <Music2 className="w-20 h-20" />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/40 via-black/20 to-black/0 rounded-xl" />
                <div className="absolute bottom-0 left-0 p-4 text-white">
                    <h3 className="font-heading font-semibold drop-shadow-lg line-clamp-2">
                        {album.album}
                    </h3>
                    <p className="text-sm text-white/90 drop-shadow-lg line-clamp-1">
                        {album.albumartist}
                    </p>
                </div>
            </div>
        </Link>
    )
}
