"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { AlbumHeader } from "./album-header"
import { DataTable } from "./data-table"
import { columns } from "./columns"
import { Button } from "@/components/ui/button"
import type { Album, Item } from "@/lib/music/database/index"

interface AlbumPageClientProps {
    album: Album
    artUrl: string | null
    tracks: Item[]
}

export function AlbumPageClient({ album, artUrl, tracks }: AlbumPageClientProps) {
    const router = useRouter()
    const [bgColor, setBgColor] = useState<string | null>(null)
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        console.log("Page client mounted, artUrl:", artUrl)
        console.log("Background color:", bgColor)

        // Trigger fade-in animation when color is set
        if (bgColor) {
            setIsVisible(true)
        }
    }, [artUrl, bgColor])

    // Convert rgb(r, g, b) to rgba(r, g, b, alpha)
    const getRgbaColor = (rgb: string, alpha: number) => {
        const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
        if (!match) return rgb
        return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`
    }

    return (
        <div
            className="min-h-screen transition-all duration-1000 ease-out"
            style={{
                background: bgColor
                    ? `linear-gradient(180deg, ${getRgbaColor(bgColor, 0.6)} 0%, ${getRgbaColor(bgColor, 0.4)} 20%, ${getRgbaColor(bgColor, 0.2)} 40%, transparent 60%), #000000`
                    : "#000000",
                opacity: isVisible || !bgColor ? 1 : 0,
            }}
        >
            <div className="container mx-auto py-6 px-4">
                <button
                    onClick={() => router.back()}
                    className="group mb-6 px-3 py-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white text-sm font-medium transition-all hover:bg-white/20 hover:scale-105 hover:border-white/30 active:scale-95 flex items-center gap-1.5"
                >
                    <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                    Back
                </button>

                <AlbumHeader
                    album={album}
                    artUrl={artUrl}
                    onColorExtracted={(color) => {
                        console.log("Color extracted:", color)
                        setBgColor(color)
                    }}
                />

                {/* Track List */}
                {tracks.length > 0 && (
                    <div className="mt-8">
                        <h2 className="text-2xl font-heading font-semibold mb-4 text-white drop-shadow-lg">
                            Tracks
                        </h2>
                        <DataTable columns={columns} data={tracks} />
                    </div>
                )}
            </div>
        </div>
    )
}
