import { Album } from "@/lib/music/database"
import Link from "next/link"
import { Music2 } from "lucide-react"
import { cn } from "@/lib/ui/utils"

export default function AlbumCard({ album, className }: { album: Album; className?: string }) {
    const artUrl = `/api/album/${album.id}/art?size=400`

    return (
        <Link
            href={`/album/${album.id}`}
            className={cn("group block overflow-hidden rounded-xl shadow-sm transition hover:shadow-md", className)}
        >
            <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
                {album.artpath ? (
                    <img
                        src={artUrl}
                        alt={`${album.album} by ${album.albumartist}`}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-400">
                        <Music2 />
                    </div>
                )}
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />
                {/* Text overlay */}
                <div className="absolute bottom-0 left-0 p-4 text-white">
                    <h3 className="font-heading font-semibold text-lg drop-shadow-lg">
                        {album.album}
                    </h3>
                    <p className="text-sm drop-shadow-lg">
                        {album.albumartist}
                    </p>
                </div>
            </div>
        </Link>
    )
}
