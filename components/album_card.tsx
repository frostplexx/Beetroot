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

    // Shimmer effect for image placeholder
    const shimmer = (w: number, h: number) => `
<svg width="${w}" height="${h}" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="g">
      <stop stop-color="#333" offset="20%" />
      <stop stop-color="#222" offset="50%" />
      <stop stop-color="#333" offset="70%" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#333" />
  <rect id="r" width="${w}" height="${h}" fill="url(#g)" />
  <animate xlink:href="#r" attributeName="x" from="-${w}" to="${w}" dur="1s" repeatCount="indefinite"  />
</svg>`;

    const toBase64 = (str: string) =>
        typeof window === "undefined"
            ? Buffer.from(str).toString("base64")
            : window.btoa(str);


    return (
        <Link
            href={`/album/${album.id}`}
            transitionTypes={['nav-forward']}
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
                    <ViewTransition name={`album-${album.id}`} share="morph">
                        <Image
                            src={`/api/album/${album.id}/art?size=400`}
                            alt={`${album.album} by ${album.albumartist}`}
                            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                            fill
                            sizes="(max-width: 640px) 50vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 17vw"
                            // priority={priority}
                            quality={75}
                            preload={true}
                            placeholder={`data:image/svg+xml;base64,${toBase64(shimmer(700, 475))}`}
                            decoding="async"
                        />
                    </ViewTransition>
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/20">
                        <Music2 className="w-16 h-16" />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute bottom-0 left-0 right-0 p-3.5 text-white pointer-events-none translate-y-0.5 group-hover:translate-y-0 transition-transform duration-300 ease-out">
                    <h3 className="font-heading font-semibold text-[13px] leading-tight drop-shadow-lg line-clamp-2 tracking-tight text-white/95">
                        {album.album}
                    </h3>
                    <p className="text-[11px] text-white/55 drop-shadow-lg line-clamp-1 mt-0.5 tracking-wide">
                        {album.albumartist}
                    </p>
                </div>
            </div>
        </Link>
    )
}
