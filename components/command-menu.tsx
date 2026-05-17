"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Album, Music, Loader2 } from "lucide-react"
import Image from "next/image"
import type { Album as AlbumType, Item } from "@/lib/music/database/index"

export function CommandMenu() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<{ albums: AlbumType[], tracks: Item[] }>({ albums: [], tracks: [] })
  const [isLoading, setIsLoading] = useState(false)
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set())

  // Toggle command menu with Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  // Fetch search results
  const fetchResults = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults({ albums: [], tracks: [] })
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(searchQuery)}`)
      const data = await response.json()
      setResults(data)
    } catch (error) {
      console.error('Error fetching search results:', error)
      setResults({ albums: [], tracks: [] })
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchResults(query)
    }, 300)

    return () => clearTimeout(timer)
  }, [query, fetchResults])

  const handleAlbumSelect = (albumId: number) => {
    setOpen(false)
    router.push(`/albums/${albumId}`)
    setQuery("")
  }

  const handleViewAll = () => {
    setOpen(false)
    router.push(`/?q=${encodeURIComponent(query)}`)
    setQuery("")
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command>
        <CommandInput
          placeholder="Search albums, artists, tracks..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-white/60">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Searching...</span>
          </div>
        ) : (
          <>
            <CommandEmpty>
              {query.length < 2
                ? "Type at least 2 characters to search..."
                : `No results found for "${query}"`}
            </CommandEmpty>

            {results.albums.length > 0 && (
              <>
                <CommandGroup heading="Albums">
                  {results.albums.map((album) => (
                    <CommandItem
                      key={`album-${album.id}`}
                      value={`album-${album.album}-${album.albumartist}`}
                      onSelect={() => handleAlbumSelect(album.id)}
                      className="flex items-center gap-3 px-2 py-3"
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded bg-white/5 overflow-hidden relative flex items-center justify-center">
                        {!album.artpath || failedImages.has(album.id) ? (
                          <Album className="w-5 h-5 text-white/60" />
                        ) : (
                          <Image
                            src={`/api/art?path=${encodeURIComponent(album.artpath)}`}
                            alt={album.album}
                            fill
                            className="object-cover"
                            sizes="40px"
                            unoptimized
                            onError={() => setFailedImages(prev => new Set(prev).add(album.id))}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {album.album}
                        </div>
                        <div className="text-xs text-white/60 truncate">
                          {album.albumartist} {album.year && `• ${album.year}`}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {results.tracks.length > 0 && (
              <>
                <CommandGroup heading="Tracks">
                  {results.tracks.map((track) => (
                    <CommandItem
                      key={`track-${track.id}`}
                      value={`track-${track.title}-${track.artist}`}
                      className="flex items-center gap-3 px-2 py-3"
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded bg-white/5 flex items-center justify-center">
                        <Music className="w-5 h-5 text-white/60" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {track.title}
                        </div>
                        <div className="text-xs text-white/60 truncate">
                          {track.artist} • {track.album}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {query.length >= 2 && (results.albums.length > 0 || results.tracks.length > 0) && (
              <CommandGroup>
                <CommandItem
                  onSelect={handleViewAll}
                  className="flex items-center justify-center py-3 text-sm font-medium text-purple-200 bg-purple-500/10 hover:bg-purple-500/20 aria-selected:bg-purple-500/20"
                >
                  View all results for "{query}"
                </CommandItem>
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
      </Command>
    </CommandDialog>
  )
}
