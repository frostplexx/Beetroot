"use client"

import { useEffect, useState } from "react"
import { prominent } from "color.js"
import { Music } from "lucide-react"
import type { Album } from "@/lib/beets/db"

interface AlbumHeaderProps {
    album: Album
    artUrl: string | null
    onColorExtracted?: (color: string) => void
}

export function AlbumHeader({ album, artUrl, onColorExtracted }: AlbumHeaderProps) {
    const [bgColor, setBgColor] = useState<string | null>(null)

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

    return (
        <div className="flex flex-col md:flex-row gap-8">
            {/* Album Artwork */}
            <div className="w-full md:w-80 sm:w-80 flex-shrink-0 mx-auto md:mx-0">
                {artUrl ? (
                    <img
                        src={artUrl}
                        alt={album.album}
                        className="w-full aspect-square object-cover rounded-lg shadow-2xl"
                        crossOrigin="anonymous"
                    />
                ) : (
                    <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center">
                        <Music className="w-24 h-24 text-muted-foreground" />
                    </div>
                )}
            </div>

            {/* Album Info */}
            <div className="flex-1 text-center md:text-left">
                <h1 className="text-4xl font-heading font-bold mb-2 text-white drop-shadow-lg">
                    {album.album}
                </h1>
                <p className="text-2xl text-white/90 mb-6 drop-shadow-lg">
                    {album.albumartist}
                </p>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                    {album.year && (
                        <div>
                            <dt className="text-sm text-white/70">Year</dt>
                            <dd className="text-lg font-semibold text-white">{album.year}</dd>
                        </div>
                    )}
                    <div>
                        <dt className="text-sm text-white/70">Tracks</dt>
                        <dd className="text-lg font-semibold text-white">
                            {album.albumtotal || 0}
                        </dd>
                    </div>
                    {album.genre && (
                        <div>
                            <dt className="text-sm text-white/70">Genre</dt>
                            <dd className="text-lg font-semibold text-white">{album.genre}</dd>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
