"use client"

import Image from "next/image"
import { ViewTransition } from "react"
import { Music2, FileQuestion } from "lucide-react"
import { useState } from "react"

export default function AlbumArtwork({
    artUrl,
    album,
    albumId,
    missingSince
}: {
    artUrl: string | null;
    album: string;
    albumId: number;
    missingSince?: number | null;
}) {
    const [tilt, setTilt] = useState({ x: 0, y: 0 })
    const [isHovering, setIsHovering] = useState(false)

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const mouseX = e.clientX
        const mouseY = e.clientY

        const rotateX = ((mouseY - centerY) / (rect.height / 2)) * -15
        const rotateY = ((mouseX - centerX) / (rect.width / 2)) * 15

        setTilt({ x: rotateX, y: rotateY })
    }

    const handleMouseLeave = () => {
        setIsHovering(false)
        setTilt({ x: 0, y: 0 })
    }

    return (
        <div
            className="w-full md:w-72 aspect-square perspective-1000"
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={handleMouseLeave}
            style={{ perspective: "1000px" }}
        >
            {missingSince ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-white/5 rounded-xl border-2 border-red-500/30">
                    <FileQuestion className="w-20 h-20 text-red-400/60" />
                    <span className="mt-3 text-sm text-red-400/80">Missing</span>
                </div>
            ) : artUrl ? (
                <ViewTransition name={`album-${albumId}`}>
                    <Image
                        src={artUrl}
                        alt={album}
                        className="w-full h-full object-cover rounded-xl shadow-2xl ring-1 ring-white/10 cursor-pointer"
                        style={{
                            transform: isHovering
                                ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.05)`
                                : "rotateX(0deg) rotateY(0deg) scale(1)",
                            transformStyle: "preserve-3d",
                            transition: isHovering
                                ? "transform 0.1s ease-out"
                                : "transform 0.3s ease-out",
                        }}
                        width={800}
                        height={800}
                        unoptimized
                    />
                </ViewTransition>
            ) : (
                <div className="w-full h-full flex items-center justify-center bg-white/5 rounded-xl">
                    <Music2 className="w-20 h-20 text-white/40" />
                </div>
            )}
        </div>
    )
}
