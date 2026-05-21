"use client"

import { useEffect, useRef } from "react"
import { prominent } from "color.js"
import { Music, Pencil } from "lucide-react"
import type { Album } from "@/lib/music/database/index"

interface AlbumHeaderProps {
    album: Album
    artUrl: string | null
    onColorExtracted?: (color: string) => void
}

export function AlbumHeader({ album, artUrl, onColorExtracted }: AlbumHeaderProps) {
    // Keep the latest onColorExtracted in a ref so the extraction effect
    // doesn't re-fire when the parent passes a new inline callback.
    const onColorExtractedRef = useRef(onColorExtracted)
    onColorExtractedRef.current = onColorExtracted

    useEffect(() => {
        if (!artUrl) return

        const cacheKey = `album-color-${album.id}`
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
            onColorExtractedRef.current?.(cached)
            return
        }

        let cancelled = false

        prominent(artUrl, { amount: 5, format: "array" })
            .then((colors) => {
                if (cancelled) return

                // Find the most saturated/colorful from the top colors
                const colorArrays = colors as number[][]
                const mostColorful = colorArrays.reduce((best, current) => {
                    const [r, g, b] = current
                    const saturation = Math.max(r, g, b) - Math.min(r, g, b)
                    const brightness = r + g + b
                    const score = saturation * (brightness > 100 ? 1 : 0.5)

                    const [br, bg, bb] = best
                    const bestSaturation = Math.max(br, bg, bb) - Math.min(br, bg, bb)
                    const bestBrightness = br + bg + bb
                    const bestScore = bestSaturation * (bestBrightness > 100 ? 1 : 0.5)

                    return score > bestScore ? current : best
                })

                let [r, g, b] = mostColorful

                const brightness = r + g + b
                if (brightness < 120) {
                    const factor = 150 / Math.max(brightness, 1)
                    r = Math.min(255, Math.round(r * factor))
                    g = Math.min(255, Math.round(g * factor))
                    b = Math.min(255, Math.round(b * factor))
                }

                const rgbColor = `rgb(${r}, ${g}, ${b})`
                localStorage.setItem(cacheKey, rgbColor)
                onColorExtractedRef.current?.(rgbColor)
            })
            .catch((err) => {
                console.error("Error extracting album color:", err)
            })

        return () => {
            cancelled = true
        }
    }, [artUrl, album.id])

    // Tilt hover effect temporarily disabled to bisect the lag source.

    return (
        <div className="flex flex-col md:flex-row gap-8">
            {/* Album Artwork */}
            <div className="w-full md:w-72 flex-shrink-0 mx-auto md:mx-0">
                <div>
                    {artUrl ? (
                        <img
                            src={artUrl}
                            alt={album.album}
                            className="w-full aspect-square object-cover rounded-xl shadow-2xl ring-1 ring-white/10"
                            crossOrigin="anonymous"
                            style={{ pointerEvents: 'none' }}
                        />
                    ) : (
                        <div className="w-full aspect-square bg-muted rounded-xl flex items-center justify-center ring-1 ring-white/10">
                            <Music className="w-20 h-20 text-muted-foreground" />
                        </div>
                    )}
                </div>
            </div>

            {/* Album Info */}
            <div className="flex-1 flex flex-col justify-start">
                <div className="space-y-4">
                    {/* Title & Edit Button */}
                    <div className="flex items-start gap-3">
                        <h1 className="text-4xl md:text-5xl font-heading font-black text-white leading-none tracking-tight flex-1">
                            {album.album}
                        </h1>
                        <button
                            type="button"
                            className="group mt-0.5 p-2 rounded-lg bg-white/10 border border-white/20 text-white transition-colors hover:bg-white/20 hover:border-white/30"
                            aria-label="Edit album"
                        >
                            <Pencil className="w-4 h-4 transition-transform group-hover:rotate-12" />
                        </button>
                    </div>

                    {/* Metadata */}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-base text-white/90">
                        <span className="font-semibold">{album.albumartist}</span>
                        <span className="text-white/40">•</span>
                        <span>{album.year}</span>
                        <span className="text-white/40">•</span>
                        <span className="text-white/70">
                            {album.albumtotal || 0} {album.albumtotal === 1 ? 'song' : 'songs'}
                        </span>
                        <span className="text-white/40">•</span>
                        <span className="text-white/70">
                            {album.duration ? Math.floor(album.duration / 60) : 0} min
                        </span>
                    </div>

                    {/* Additional Info */}
                    <div className="flex flex-wrap gap-4 text-sm">
                        {album.country && (
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-white/60 uppercase tracking-wider text-[10px] font-medium">Country</span>
                                <span className="text-white text-xs font-semibold">{album.country}</span>
                            </div>
                        )}

                        {album.label && (
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-white/60 uppercase tracking-wider text-[10px] font-medium">Label</span>
                                <span className="text-white text-xs font-semibold">{album.label}</span>
                            </div>
                        )}
                    </div>

                    {/* Genres */}
                    {album.genres && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {album.genres.replaceAll("\\␀", ",").split(",").map((genre) => (
                                <span
                                    key={genre}
                                    className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/15 text-xs font-medium text-white border border-white/20 transition-colors hover:bg-white/25"
                                >
                                    {genre.trim()}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
