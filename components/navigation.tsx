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

    const iconButtonClass = "p-2 rounded-full transition-all duration-200 active:scale-90"
    const iconButtonActive = "text-white bg-white/15"
    const iconButtonInactive = "text-white/70 hover:text-white hover:bg-white/10"

    return (
        <header className="sticky top-0 z-50 w-full bg-black/40 backdrop-blur-xl border-b border-white/[0.06]">
            <div className="container mx-auto px-4 py-3">
                <div className="flex flex-col items-center gap-4 w-full">
                    <div className="flex items-center gap-3 w-xl">

                        <Link
                            href="/"
                            className={`${iconButtonClass} ${isLibraryActive ? iconButtonActive : iconButtonInactive}`}
                            aria-label="Library"
                        >
                            <Library className="w-5 h-5" />
                        </Link>

                        <button
                            className={`${iconButtonClass} ${iconButtonInactive}`}
                            aria-label="Upload"
                        >
                            <Upload className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-2 flex-1 max-w-2xl">
                            <div className="relative flex-1">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none z-10" />
                                <Button
                                    onClick={() => setCommandOpen(true)}
                                    className="w-full h-9 pl-10 pr-4 text-sm bg-white/[0.08] border border-white/10 rounded-full text-white hover:bg-white/[0.12] hover:border-white/20 transition-all duration-200 active:scale-[0.99]"
                                >
                                    <span className="text-white/60 flex-1 flex items-center gap-2 font-normal">
                                        Search albums, artists...
                                        <span className="flex-1"></span>
                                        <KbdGroup>
                                            <Kbd>⌘</Kbd>
                                            <Kbd>K</Kbd>
                                        </KbdGroup>
                                    </span>
                                </Button>
                            </div>

                            <div className="flex gap-1">
                                <div className="relative">
                                    <button
                                        onClick={() => setToolsOpen(!toolsOpen)}
                                        className={`${iconButtonClass} ${toolsOpen ? iconButtonActive : iconButtonInactive}`}
                                        aria-label="Tools"
                                    >
                                        <MoreHorizontal className="w-5 h-5" />
                                    </button>
                                    {toolsOpen && (
                                        <div className="absolute right-0 mt-2 w-52 p-1.5 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl shadow-black/50 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                                            <button className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors duration-150">
                                                Import Library
                                            </button>
                                            <button className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors duration-150">
                                                Export Playlist
                                            </button>
                                            <button className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors duration-150">
                                                Scan Files
                                            </button>
                                            <div className="h-px bg-white/[0.06] my-1" />
                                            <Link
                                                href="/admin"
                                                onClick={() => setToolsOpen(false)}
                                                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors duration-150"
                                            >
                                                <Wrench className="w-4 h-4" />
                                                Maintenance
                                            </Link>
                                        </div>
                                    )}
                                </div>

                                <button
                                    className={`${iconButtonClass} ${iconButtonInactive}`}
                                    aria-label="Notifications"
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
