"use client"

import { Library, Search, Upload, MoreHorizontal } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

export default function Navigation() {
    const pathname = usePathname()
    const [toolsOpen, setToolsOpen] = useState(false)
    const isLibraryActive = pathname === "/" || pathname.startsWith("/library") || pathname.startsWith("/album")

    return (
        <header className="sticky top-0 z-50 bg-black/60 backdrop-blur-md border-b border-white/10">
            <div className="container mx-auto px-4 py-3">
                <div className="flex items-center gap-4 w-full">
                    <Link
                        href="/"
                        className={`p-2 rounded-full transition-all ${
                            isLibraryActive
                                ? "text-white bg-white/20"
                                : "text-white/70 hover:text-white hover:bg-white/10"
                        }`}
                        aria-label="Library"
                    >
                        <Library className="w-5 h-5" />
                    </Link>

                    <div className="flex items-center gap-2 flex-1 max-w-2xl">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                            <input
                                type="text"
                                placeholder="Search albums, artists..."
                                className="w-full h-9 pl-10 pr-4 text-sm bg-white/10 border border-white/20 rounded-full text-white placeholder:text-white/50 focus:bg-white/15 focus:border-white/30 focus:outline-none transition-all"
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all"
                                aria-label="Upload"
                            >
                                <Upload className="w-5 h-5" />
                            </button>

                            <div className="relative">
                                <button
                                    onClick={() => setToolsOpen(!toolsOpen)}
                                    className={`p-2 rounded-full transition-all ${
                                        toolsOpen
                                            ? "text-white bg-white/10"
                                            : "text-white/70 hover:text-white hover:bg-white/10"
                                    }`}
                                    aria-label="Tools"
                                >
                                    <MoreHorizontal className="w-5 h-5" />
                                </button>
                                {toolsOpen && (
                                    <div className="absolute right-0 mt-2 w-48 p-2 bg-black/95 backdrop-blur-md border border-white/10 rounded-lg">
                                        <button className="w-full text-left px-3 py-2 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/10 transition-all">
                                            Import Library
                                        </button>
                                        <button className="w-full text-left px-3 py-2 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/10 transition-all">
                                            Export Playlist
                                        </button>
                                        <button className="w-full text-left px-3 py-2 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/10 transition-all">
                                            Scan Files
                                        </button>
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </header>
    )
}
