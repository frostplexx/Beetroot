"use client"

import { useEffect, useState } from "react"

export default function DynamicBackground({ artUrl }: { artUrl: string | null }) {
    const [bgGradient, setBgGradient] = useState("")

    useEffect(() => {
        if (!artUrl) return

        const loadColors = async () => {
            try {
                // Create an image element and load it
                const img = new Image()
                img.crossOrigin = "anonymous"

                await new Promise((resolve, reject) => {
                    img.onload = resolve
                    img.onerror = reject
                    img.src = artUrl
                })

                // Extract color using Canvas
                const canvas = document.createElement("canvas")
                const ctx = canvas.getContext("2d")
                if (!ctx) return

                canvas.width = img.width
                canvas.height = img.height
                ctx.drawImage(img, 0, 0)

                // Sample colors from the image
                const samples = 5
                const colors: number[][] = []

                for (let i = 0; i < samples; i++) {
                    const x = Math.floor((img.width / samples) * i + img.width / (samples * 2))
                    const y = Math.floor(img.height / 2)
                    const pixel = ctx.getImageData(x, y, 1, 1).data
                    colors.push([pixel[0], pixel[1], pixel[2]])
                }

                // Find most saturated color
                const mostSaturated = colors.reduce((prev, curr) => {
                    const [r1, g1, b1] = prev
                    const [r2, g2, b2] = curr
                    const sat1 = Math.max(r1, g1, b1) - Math.min(r1, g1, b1)
                    const sat2 = Math.max(r2, g2, b2) - Math.min(r2, g2, b2)
                    return sat2 > sat1 ? curr : prev
                })

                const [r, g, b] = mostSaturated
                console.log("Extracted color:", { r, g, b })

                const gradient = `linear-gradient(180deg, rgba(${r}, ${g}, ${b}, 0.6) 0%, rgba(${r}, ${g}, ${b}, 0.4) 20%, rgba(${r}, ${g}, ${b}, 0.2) 40%, transparent 60%)`
                console.log("Setting gradient:", gradient)
                setBgGradient(gradient)
            } catch (error) {
                console.error("Failed to extract colors:", error)
            }
        }

        loadColors()
    }, [artUrl])

    return (
        <>
            <div
                className="fixed inset-0 pointer-events-none transition-opacity duration-500"
                style={{
                    background: bgGradient || "transparent",
                    opacity: bgGradient ? 1 : 0,
                }}
            />
            <div className="fixed inset-0 bg-black pointer-events-none -z-10" />
        </>
    )
}
