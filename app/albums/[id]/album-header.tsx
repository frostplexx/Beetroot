"use client"

import { useEffect, useState } from "react"
import { prominent } from "color.js"
import { Music, Pencil } from "lucide-react"
import type { Album } from "@/lib/music/database/index"

interface AlbumHeaderProps {
    album: Album
    artUrl: string | null
    onColorExtracted?: (color: string) => void
}

export function AlbumHeader({ album, artUrl, onColorExtracted }: AlbumHeaderProps) {
    const [bgColor, setBgColor] = useState<string | null>(null)
    const [tilt, setTilt] = useState({ x: 0, y: 0 })
    const [isHovering, setIsHovering] = useState(false)

    useEffect(() => {
        if (!artUrl) {
            console.log("No artUrl provided")
            return
        }

        // Check cache first
        const cacheKey = `album-color-${album.id}`
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
            console.log("Using cached color:", cached)
            setBgColor(cached)
            onColorExtracted?.(cached)
            return
        }

        console.log("Attempting to extract color from:", artUrl)

        prominent(artUrl, { amount: 5, format: "array" })
            .then((colors) => {
                console.log("Raw colors extracted:", colors)

                // Find the most saturated/colorful from the top colors
                const colorArrays = colors as number[][]
                const mostColorful = colorArrays.reduce((best, current) => {
                    const [r, g, b] = current

                    // Calculate saturation (how "colorful" vs gray)
                    const max = Math.max(r, g, b)
                    const min = Math.min(r, g, b)
                    const saturation = max - min

                    // Calculate brightness
                    const brightness = r + g + b

                    // Prefer saturated colors, but not too dark
                    const score = saturation * (brightness > 100 ? 1 : 0.5)

                    const [br, bg, bb] = best
                    const bestMax = Math.max(br, bg, bb)
                    const bestMin = Math.min(br, bg, bb)
                    const bestSaturation = bestMax - bestMin
                    const bestBrightness = br + bg + bb
                    const bestScore = bestSaturation * (bestBrightness > 100 ? 1 : 0.5)

                    return score > bestScore ? current : best
                })

                let [r, g, b] = mostColorful

                // Slightly boost brightness if needed
                const brightness = r + g + b
                if (brightness < 120) {
                    const factor = 150 / Math.max(brightness, 1)
                    r = Math.min(255, Math.round(r * factor))
                    g = Math.min(255, Math.round(g * factor))
                    b = Math.min(255, Math.round(b * factor))
                }

                const rgbColor = `rgb(${r}, ${g}, ${b})`
                console.log("Selected color:", rgbColor, "from", colors)

                // Cache the color
                const cacheKey = `album-color-${album.id}`
                localStorage.setItem(cacheKey, rgbColor)

                setBgColor(rgbColor)
                onColorExtracted?.(rgbColor)
            })
            .catch((err) => {
                console.error("Error extracting color:", err)
                console.error("Error details:", err.message, err.stack)
            })
    }, [artUrl, onColorExtracted])

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const element = e.currentTarget
        const rect = element.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const centerX = rect.width / 2
        const centerY = rect.height / 2
        const rotateX = ((y - centerY) / centerY) * -15
        const rotateY = ((x - centerX) / centerX) * 15

        setTilt({ x: rotateX, y: rotateY })
    }

    const handleMouseLeave = () => {
        setIsHovering(false)
        setTilt({ x: 0, y: 0 })
    }

    const handleMouseEnter = () => {
        setIsHovering(true)
    }

    return (
        <div className="flex flex-col md:flex-row gap-8">
            {/* Album Artwork */}
            <div
                className="w-full md:w-72 flex-shrink-0 mx-auto md:mx-0"
                style={{ perspective: '1000px' }}
            >
                <div
                    onMouseMove={handleMouseMove}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    style={{
                        transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) ${isHovering ? 'scale(1.05)' : 'scale(1)'}`,
                        transition: isHovering ? 'transform 0.1s ease-out' : 'transform 0.3s ease-out',
                        transformStyle: 'preserve-3d',
                    }}
                    className="cursor-pointer"
                >
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
                            className="group mt-0.5 p-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white transition-all hover:bg-white/20 hover:scale-110 hover:border-white/30 active:scale-95"
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
                                    className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs font-medium text-white border border-white/20 transition-all hover:bg-white/25 hover:scale-105"
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
