"use client"

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { AlbumHeader } from "./album-header"
import { DataTable } from "./data-table"
import { columns } from "./columns"
import { useReconcileEvents } from "@/lib/ui/use-reconcile-events"
import type { Album, Item } from "@/lib/music/database/index"

interface AlbumPageClientProps {
    album: Album
    artUrl: string | null
    tracks: Item[]
}

function getRgbaColor(rgb: string, alpha: number): string {
    const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (!match) return rgb
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`
}

export function AlbumPageClient({ album, artUrl, tracks }: AlbumPageClientProps) {
    const router = useRouter()
    const [bgColor, setBgColor] = useState<string | null>(null)

    useReconcileEvents({
        fireOnNoChanges: true,
        onCompleted: () => router.refresh(),
    })

    const handleColorExtracted = useCallback((color: string) => {
        setBgColor(color)
    }, [])

    const background = useMemo(() => {
        if (!bgColor) return "#000000"
        return `linear-gradient(180deg, ${getRgbaColor(bgColor, 0.6)} 0%, ${getRgbaColor(bgColor, 0.4)} 20%, ${getRgbaColor(bgColor, 0.2)} 40%, transparent 60%), #000000`
    }, [bgColor])

    return (
        <div className="min-h-screen relative">
            {/* Fixed-position gradient so it doesn't scroll under the navbar's
                backdrop-blur (which would force a re-blur every frame). */}
            <div
                aria-hidden
                className="fixed inset-0 -z-10 pointer-events-none"
                style={{ background }}
            />
            <div className="container mx-auto py-6 px-4">
                <button
                    onClick={() => router.back()}
                    className="group mb-6 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm font-medium transition-colors hover:bg-white/20 hover:border-white/30 flex items-center gap-1.5"
                >
                    <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                    Back
                </button>

                <AlbumHeader
                    album={album}
                    artUrl={artUrl}
                    onColorExtracted={handleColorExtracted}
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
