import { Library, Search, Wrench } from "lucide-react"
import { Link, useLocation } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import { Button } from "./ui/button"
import { Kbd, KbdGroup } from "./ui/kbd"
import { CommandBar } from "./command-bar"
import { useLibrarySync } from "@/hooks/use-library-sync"

export default function Navigation() {
    const pathname = useLocation({ select: (s) => s.pathname })
    const [commandOpen, setCommandOpen] = useState(false)
    const isLibraryActive = pathname === "/" || pathname.startsWith("/library") || pathname.startsWith("/album")
    const isAdminActive = pathname.startsWith("/admin")

    const syncState = useLibrarySync()

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

    const iconButtonClass = "p-2.5 rounded-full transition-all duration-200 active:scale-90"
    const iconButtonActive = "text-white bg-white/15"
    const iconButtonInactive = "text-white/65 hover:text-white hover:bg-white/8 transition-colors"

    return (
        <div className="mt-3 fixed w-screen flex justify-center pointer-events-none z-50">
            <header className="pointer-events-auto max-w-[calc(100vw-1.5rem)] bg-[#0e0e0e]/40 backdrop-blur-3xl border border-white/[0.05] rounded-2xl shadow-[0_8px_40px_-8px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.02),0_0_60px_-20px_rgba(232,65,64,0.12)]">
                <div className="px-2.5 py-2">
                    <div className="flex items-center gap-1.5">

                        <Link
                            to="/"
                            search={{ page: 1, sort: "recently-added" as const }}
                            className={`${iconButtonClass} flex-shrink-0 ${isLibraryActive ? iconButtonActive : iconButtonInactive}`}
                            aria-label="Library"
                        >
                            <Library className="w-5 h-5" />
                        </Link>

                        {/* Mobile: icon-only search button */}
                        <button
                            onClick={() => setCommandOpen(true)}
                            className={`${iconButtonClass} flex-shrink-0 md:hidden ${iconButtonInactive}`}
                            aria-label="Search"
                        >
                            <Search className="w-5 h-5" />
                        </button>

                        {/* Desktop: full search bar */}
                        <div className="relative hidden md:block min-w-0 w-[272px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/55 pointer-events-none z-10" />
                            <Button
                                onClick={() => setCommandOpen(true)}
                                className="h-8 w-full pl-9 pr-3 text-sm bg-white/[0.05] border border-white/[0.07] rounded-xl text-white hover:bg-white/[0.08] hover:border-white/[0.14] hover:shadow-[0_0_16px_-4px_rgba(232,65,64,0.2)] transition-all duration-150 active:scale-[0.99] cursor-text"
                            >
                                <span className="text-white/60 flex-1 flex items-center gap-2 font-normal text-[13px]">
                                    Search albums, artists...
                                    <span className="flex-1" />
                                    <KbdGroup>
                                        <Kbd>⌘</Kbd>
                                        <Kbd>K</Kbd>
                                    </KbdGroup>
                                </span>
                            </Button>
                        </div>

                        <Link
                            to="/admin"
                            className={`${iconButtonClass} flex-shrink-0 relative ${isAdminActive ? iconButtonActive : iconButtonInactive}`}
                            aria-label="Maintenance"
                        >
                            <Wrench className="w-5 h-5" />
                            {syncState.isReconciling && (
                                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            )}
                        </Link>
                    </div>
                </div>
                <CommandBar open={commandOpen} onOpenChange={setCommandOpen} />
            </header>
        </div>
    )
}
