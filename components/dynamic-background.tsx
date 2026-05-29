import { useEffect, useState } from "react"

export default function DynamicBackground({ artUrl }: { artUrl: string | null }) {
    const [color, setColor] = useState<[number, number, number] | null>(null)

    useEffect(() => {
        if (!artUrl) return

        const load = async () => {
            try {
                const img = new Image()
                img.crossOrigin = "anonymous"
                await new Promise((resolve, reject) => {
                    img.onload = resolve
                    img.onerror = reject
                    img.src = artUrl
                })

                const canvas = document.createElement("canvas")
                const ctx = canvas.getContext("2d")
                if (!ctx) return

                canvas.width = 50
                canvas.height = 50
                ctx.drawImage(img, 0, 0, 50, 50)

                const samples = 5
                const colors: [number, number, number][] = []
                for (let i = 0; i < samples; i++) {
                    const x = Math.floor((50 / samples) * i + 50 / (samples * 2))
                    const pixel = ctx.getImageData(x, 25, 1, 1).data
                    colors.push([pixel[0], pixel[1], pixel[2]])
                }

                const mostSaturated = colors.reduce((prev, curr) => {
                    const sat = (c: [number, number, number]) => Math.max(...c) - Math.min(...c)
                    return sat(curr) > sat(prev) ? curr : prev
                })

                setColor(mostSaturated)
            } catch {
                // ignore
            }
        }

        load()
    }, [artUrl])

    const rgb = color ? `${color[0]}, ${color[1]}, ${color[2]}` : "232, 65, 64"
    const visible = color != null

    return (
        <>
            {/* Deep bg */}
            <div className="fixed inset-0 bg-[#0a0a0a] -z-20 pointer-events-none" />

            {/* Large top-center bloom */}
            <div
                className="fixed -top-[150px] left-1/2 -translate-x-1/2 w-[900px] h-[700px] rounded-full pointer-events-none -z-10 transition-opacity duration-1000"
                style={{
                    background: `radial-gradient(ellipse at center, rgba(${rgb}, 0.22) 0%, rgba(${rgb}, 0.10) 35%, transparent 65%)`,
                    filter: "blur(60px)",
                    opacity: visible ? 1 : 0,
                }}
            />

            {/* Secondary side glow */}
            <div
                className="fixed top-[20%] -left-[100px] w-[500px] h-[600px] rounded-full pointer-events-none -z-10 transition-opacity duration-1000"
                style={{
                    background: `radial-gradient(ellipse at center, rgba(${rgb}, 0.10) 0%, transparent 65%)`,
                    filter: "blur(80px)",
                    opacity: visible ? 0.7 : 0,
                }}
            />

            {/* Bottom ambient glow */}
            <div
                className="fixed bottom-0 right-[10%] w-[600px] h-[400px] rounded-full pointer-events-none -z-10 transition-opacity duration-1000"
                style={{
                    background: `radial-gradient(ellipse at center, rgba(${rgb}, 0.07) 0%, transparent 65%)`,
                    filter: "blur(100px)",
                    opacity: visible ? 0.5 : 0,
                }}
            />
        </>
    )
}
