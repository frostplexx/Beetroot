import Link from "next/link"
import { Music2, FileQuestion } from "lucide-react"
import { cn } from "@/lib/ui/utils"
import Image from "next/image";
import { ViewTransition } from "react";

interface AlbumCardData {
    id: number;
    album: string;
    albumartist: string;
    artpath: string | null;
    added: number;
    missing_since: number | null;
}

export default function AlbumCard({
    album,
    className,
    priority = false,
}: {
    album: AlbumCardData;
    className?: string;
    priority?: boolean;
}) {
    return (
        <Link
            href={`/album/${album.id}`}
            transitionTypes={['nav-forward']}
            className={cn(
                "group block overflow-hidden rounded-2xl transition-all duration-300 ease-out hover:scale-[1.03] active:scale-[0.99]",
                className
            )}
        >
            <div className="relative aspect-square w-full overflow-hidden bg-white/5 rounded-2xl">
                {album.missing_since ? (
                    <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl border border-red-500/20 text-red-400/60 bg-red-500/[0.03]">
                        <FileQuestion className="w-16 h-16" />
                        <span className="mt-2 text-xs text-red-400/80">Missing</span>
                    </div>
                ) : album.artpath ? (
                    <ViewTransition name={`album-${album.id}`} share="morph">
                        <Image
                            src={`/api/album/${album.id}/art?size=400`}
                            alt={`${album.album} by ${album.albumartist}`}
                            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110 rounded-2xl shadow-2xl shadow-black/40 ring-1 ring-white/10 group-hover:shadow-black/60 group-hover:ring-white/20"
                            fill
                            sizes="(max-width: 640px) 50vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 17vw"
                            priority={priority}
                        />
                    </ViewTransition>
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/40 rounded-2xl">
                        <Music2 className="w-20 h-20" />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent rounded-2xl pointer-events-none opacity-90 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute bottom-0 left-0 right-0 p-4 text-white pointer-events-none translate-y-0 group-hover:translate-y-[-2px] transition-transform duration-300 ease-out">
                    <h3 className="font-heading font-semibold drop-shadow-lg line-clamp-2 tracking-tight">
                        {album.album}
                    </h3>
                    <p className="text-sm text-white/85 drop-shadow-lg line-clamp-1 mt-0.5">
                        {album.albumartist}
                    </p>
                </div>
            </div>
        </Link>
    )
}
