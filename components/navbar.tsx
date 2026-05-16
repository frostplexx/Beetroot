"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Library, Info, Search, Upload, Wrench, Settings } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"
import { SearchSuggestions } from "./search-suggestions"
import type { Album, Item } from "@/lib/beets/db"

import { cn } from "@/lib/utils"

const routes = [
  {
    href: "/",
    icon: Library,
    label: "Library",
  },
]

export function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<{ albums: Album[], tracks: Item[] }>({ albums: [], tracks: [] })
  const [isLoading, setIsLoading] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout>()

  // Initialize search query from URL params
  useEffect(() => {
    const query = searchParams.get('q') || ''
    setSearchQuery(query)
  }, [searchParams])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch suggestions with debounce
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSuggestions({ albums: [], tracks: [] })
      setShowSuggestions(false)
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`)
      const data = await response.json()
      setSuggestions(data)
      setShowSuggestions(true)
    } catch (error) {
      console.error('Error fetching suggestions:', error)
      setSuggestions({ albums: [], tracks: [] })
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedQuery = searchQuery.trim()

    setShowSuggestions(false)

    if (trimmedQuery) {
      router.push(`/?q=${encodeURIComponent(trimmedQuery)}`)
    } else {
      router.push('/')
    }
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Set new timer for debounced search
    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(value)
    }, 300)
  }

  const handleCloseSuggestions = () => {
    setShowSuggestions(false)
  }

  return (
    <div className="flex items-center w-full relative justify-center">
      {/* Center: Library + Search Bar + Action Buttons */}
      <div className="flex items-center gap-2 w-full max-w-2xl">
        {/* Library Button */}
        {routes.map((route) => {
          const isActive = pathname === route.href
          const Icon = route.icon

          return (
            <Link
              key={route.href}
              href={route.href}
              className={cn(
                "p-2 rounded-full transition-all",
                isActive
                  ? "bg-white/20 text-white"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              )}
              aria-label={route.label}
            >
              <Icon className="w-5 h-5" />
            </Link>
          )
        })}

        {/* Upload Button */}
        <Link
          href="/upload"
          className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all"
          aria-label="Upload"
        >
          <Upload className="w-5 h-5" />
        </Link>

        <div ref={searchRef} className="flex-1 relative">
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none z-10" />
            <Input
              type="search"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search albums, artists, tracks..."
              className="pl-10 pr-16 h-9 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:bg-white/15 focus:border-white/30 transition-all rounded-full"
              autoComplete="off"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-white/20 bg-white/5 px-1.5 font-mono text-[10px] font-medium text-white/60">
              <span className="text-xs">⌘</span>K
            </kbd>
          </form>

          {/* Search Suggestions Dropdown */}
          {showSuggestions && searchQuery.trim().length >= 2 && (
            <SearchSuggestions
              albums={suggestions.albums}
              tracks={suggestions.tracks}
              query={searchQuery}
              onClose={handleCloseSuggestions}
            />
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Tools Menu */}
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger className="p-2 h-auto rounded-full bg-transparent text-white/70 hover:text-white hover:bg-white/10 border-0 focus:bg-white/10 data-open:bg-white/10 data-open:text-white">
                  <Wrench className="w-5 h-5" />
                </NavigationMenuTrigger>
                <NavigationMenuContent className="bg-black/95 backdrop-blur-md border border-white/10">
                  <ul className="w-48 p-2">
                    <li>
                      <NavigationMenuLink className="text-white/70 hover:text-white hover:bg-white/10">
                        Import Library
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink className="text-white/70 hover:text-white hover:bg-white/10">
                        Export Playlist
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink className="text-white/70 hover:text-white hover:bg-white/10">
                        Scan Files
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          {/* Settings Menu */}
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger className="p-2 h-auto rounded-full bg-transparent text-white/70 hover:text-white hover:bg-white/10 border-0 focus:bg-white/10 data-open:bg-white/10 data-open:text-white">
                  <Settings className="w-5 h-5" />
                </NavigationMenuTrigger>
                <NavigationMenuContent className="bg-black/95 backdrop-blur-md border border-white/10">
                  <ul className="w-48 p-2">
                    <li>
                      <NavigationMenuLink className="text-white/70 hover:text-white hover:bg-white/10">
                        Preferences
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink className="text-white/70 hover:text-white hover:bg-white/10">
                        Audio Quality
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink className="text-white/70 hover:text-white hover:bg-white/10">
                        Privacy
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </div>
    </div>
  )
}
