import { Link } from "@tanstack/react-router"
import { Music2, FileQuestion } from "lucide-react"
import { cn } from "@/lib/ui/utils"

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
            to="/album/$id"
            params={{ id: String(album.id) }}
            className={cn(
                "group block overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] transition-all duration-300 ease-out hover:scale-[1.03] hover:border-white/[0.12] hover:bg-white/[0.04] hover:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.8),0_0_20px_-8px_rgba(232,65,64,0.15)] active:scale-[0.99]",
                className
            )}
        >
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl">
                {album.missing_since ? (
                    <div className="flex h-full w-full flex-col items-center justify-center text-red-400/60 bg-red-500/[0.03]">
                        <FileQuestion className="w-14 h-14" />
                        <span className="mt-2 text-xs text-red-400/70 tracking-wide">Missing</span>
                    </div>
                ) : album.artpath ? (
                    <img
                        src={`/api/album/${album.id}/art?size=400`}
                        alt={`${album.album} by ${album.albumartist}`}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                        loading={priority ? "eager" : "lazy"}
                        decoding="async"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/50">
                        <Music2 className="w-16 h-16" />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute bottom-0 left-0 right-0 p-3.5 text-white pointer-events-none translate-y-0.5 group-hover:translate-y-0 transition-transform duration-300 ease-out">
                    <h3 className="font-heading font-semibold text-[13px] leading-tight drop-shadow-lg line-clamp-2 tracking-tight text-white/95">
                        {album.album}
                    </h3>
                    <p className="text-[11px] text-white/70 drop-shadow-lg line-clamp-1 mt-0.5 tracking-wide">
                        {album.albumartist}
                    </p>
                </div>
            </div>
        </Link>
    )
}
