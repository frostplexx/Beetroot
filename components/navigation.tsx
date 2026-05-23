"use client"

import { Library, Search, Upload, MoreHorizontal, Bell, Wrench } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { Button } from "./ui/button"
import { Kbd, KbdGroup } from "./ui/kbd"
import { CommandBar } from "./command-bar"

export default function Navigation() {
    const pathname = usePathname()
    const [toolsOpen, setToolsOpen] = useState(false)
    const [commandOpen, setCommandOpen] = useState(false)
    const isLibraryActive = pathname === "/" || pathname.startsWith("/library") || pathname.startsWith("/album")

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setCommandOpen((open) => !open)
            }
        }

        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [])

    return (
        <header className="sticky top-0 z-50 w-screen bg-black/60 backdrop-blur-md border-b border-white/10">
            <div className="container mx-auto px-4 py-3">
                <div className="flex flex-col items-center content-center gap-4 w-full ">

                    <div className="flex items-center gap-4 w-xl">

                        <Link
                            href="/"
                            className={`p-2 rounded-full transition-all ${isLibraryActive
                                ? "text-white bg-white/20"
                                : "text-white/70 hover:text-white hover:bg-white/10"
                                }`}
                            aria-label="Library"
                        >
                            <Library className="w-5 h-5" />
                        </Link>


                        <button
                            className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all"
                            aria-label="Upload"
                        >
                            <Upload className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-2 flex-1 max-w-2xl">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                                <Button
                                    onClick={() => setCommandOpen(true)}
                                    className="transition-all hover:text-white hover:bg-white/10 w-full h-9 pl-10 pr-4 text-sm bg-white/10 border border-white/20 rounded-full text-white placeholder:text-white/50 focus:bg-white/15 focus:border-white/30 focus:outline-none transition-all"
                                >
                                    <span className="text-white/70 flex-1 flex items-center gap-2">
                                        Search albums, artists...
                                        <span className="flex-1"></span>
                                        <KbdGroup>
                                            <Kbd>⌘</Kbd>
                                            <Kbd>K</Kbd>
                                        </KbdGroup>
                                    </span>
                                </Button>
                            </div>

                            <div className="flex gap-2">

                                <div className="relative">
                                    <button
                                        onClick={() => setToolsOpen(!toolsOpen)}
                                        className={`p-2 rounded-full transition-all ${toolsOpen
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
                                            <Link
                                                href="/admin"
                                                onClick={() => setToolsOpen(false)}
                                                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/10 transition-all"
                                            >
                                                <Wrench className="w-4 h-4" />
                                                Maintenance
                                            </Link>
                                        </div>
                                    )}
                                </div>


                                <button
                                    className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all"
                                    aria-label="Notifiactions"
                                >
                                    <Bell className="w-5 h-5" />
                                </button>

                            </div>
                        </div>
                    </div>


                </div>
            </div>
            <CommandBar open={commandOpen} onOpenChange={setCommandOpen} />
        </header>
    )
}
