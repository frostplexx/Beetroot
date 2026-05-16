"use client"

import { useState } from "react"

interface PageWrapperProps {
    children: React.ReactNode
    onColorExtracted: (color: string) => void
}

export function PageWrapper({ children, onColorExtracted }: PageWrapperProps) {
    const [bgColor, setBgColor] = useState<string | null>(null)

    const handleColorExtracted = (color: string) => {
        setBgColor(color)
        onColorExtracted(color)
    }

    return (
        <div
            className="min-h-screen"
            style={{
                background: bgColor
                    ? `linear-gradient(180deg, ${bgColor}E6 0%, ${bgColor}CC 100%)`
                    : undefined,
            }}
        >
            {children}
        </div>
    )
}
