"use client"

import { Library, Search, Bell } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { Button } from "./ui/button"
import { Kbd, KbdGroup } from "./ui/kbd"
import { CommandBar } from "./command-bar"
import { useLibrarySync } from "@/hooks/use-library-sync"
import type { SyncLogEntry } from "@/hooks/use-library-sync"

export default function Navigation() {
    const pathname = usePathname()
    const [commandOpen, setCommandOpen] = useState(false)
    const [notifOpen, setNotifOpen] = useState(false)
    const isLibraryActive = pathname === "/" || pathname.startsWith("/library") || pathname.startsWith("/album")

    const syncState = useLibrarySync()
    const notifRef = useRef<HTMLDivElement>(null)

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

    useEffect(() => {
        if (!notifOpen) return
        const handleClick = (e: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
                setNotifOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClick)
        return () => document.removeEventListener("mousedown", handleClick)
    }, [notifOpen])

    const iconButtonClass = "p-2 rounded-full transition-all duration-200 active:scale-90"
    const iconButtonActive = "text-white bg-white/15"
    const iconButtonInactive = "text-white/50 hover:text-white hover:bg-white/8 transition-colors"

    return (
        <div className="fixed absolute top-0 inset-x-0 z-50 flex justify-center px-4 pt-3 pb-2 pointer-events-none">
            <header className="pointer-events-auto inline-flex bg-[#0e0e0e]/40 backdrop-blur-3xl border border-white/[0.05] rounded-2xl shadow-[0_8px_40px_-8px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.02),0_0_60px_-20px_rgba(232,65,64,0.12)]">
                <div className="px-2.5 py-2">
                    <div className="flex items-center gap-1.5">

                        <Link
                            href="/"
                            className={`${iconButtonClass} flex-shrink-0 ${isLibraryActive ? iconButtonActive : iconButtonInactive}`}
                            aria-label="Library"
                        >
                            <Library className="w-4.5 h-4.5" />
                        </Link>

                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35 pointer-events-none z-10" />
                            <Button
                                onClick={() => setCommandOpen(true)}
                                className="h-8 w-68 pl-9 pr-3 text-sm bg-white/[0.05] border border-white/[0.07] rounded-xl text-white hover:bg-white/[0.08] hover:border-white/[0.14] hover:shadow-[0_0_16px_-4px_rgba(232,65,64,0.2)] transition-all duration-150 active:scale-[0.99] cursor-text"
                            >
                                <span className="text-white/40 flex-1 flex items-center gap-2 font-normal text-[13px]">
                                    Search albums, artists...
                                    <span className="flex-1" />
                                    <KbdGroup>
                                        <Kbd>⌘</Kbd>
                                        <Kbd>K</Kbd>
                                    </KbdGroup>
                                </span>
                            </Button>
                        </div>

                        <div className="relative flex-shrink-0" ref={notifRef}>
                                <button
                                    onClick={() => setNotifOpen(!notifOpen)}
                                    className={`${iconButtonClass} ${notifOpen ? iconButtonActive : iconButtonInactive} relative`}
                                    aria-label="Notifications"
                                >
                                    <Bell className="w-4.5 h-4.5" />
                                    {syncState.isReconciling && (
                                        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                    )}
                                </button>

                                {notifOpen && (
                                    <div className="absolute right-0 mt-2 w-80 bg-[#0e0e0e]/95 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_40px_-8px_rgba(0,0,0,0.9),0_0_60px_-20px_rgba(232,65,64,0.08)] animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                                        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                                            <p className="text-[11px] uppercase tracking-[0.14em] text-white/35 font-medium">Activity</p>
                                            {syncState.isReconciling && (
                                                <span className="flex items-center gap-1.5 text-[11px] text-white/40">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                                    Scanning
                                                </span>
                                            )}
                                        </div>

                                        <div className="max-h-72 overflow-y-auto py-1">
                                            {syncState.log.length === 0 ? (
                                                <p className="text-sm text-white/25 px-4 py-6 text-center">No recent activity</p>
                                            ) : (
                                                [...syncState.log].reverse().map(entry => (
                                                    <LogRow key={entry.id} entry={entry} />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                    </div>
                </div>
            </header>
            <CommandBar open={commandOpen} onOpenChange={setCommandOpen} />
        </div>
    )
}

function LogRow({ entry }: { entry: SyncLogEntry }) {
    const dotColor =
        entry.isActive         ? "bg-white/60 animate-pulse" :
        entry.type === "error" ? "bg-red-400" :
        entry.type === "completed" ? "bg-emerald-400/70" :
        "bg-white/20"

    const textColor = entry.type === "error" ? "text-red-400" : "text-white/70"

    return (
        <div className="flex items-start gap-3 px-4 py-2.5">
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${dotColor}`} />
            <div className="flex-1 min-w-0">
                <p className={`text-[13px] leading-snug ${textColor}`}>{entry.message}</p>
                <p className="text-[11px] text-white/25 mt-0.5">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                </p>
            </div>
        </div>
    )
}
