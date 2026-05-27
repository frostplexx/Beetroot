"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Album as AlbumIcon, Music, Disc, Upload, FolderOpen, Library, FileQuestion } from "lucide-react"
import {
  CommandDialog,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Album } from "@/lib/music/database/albums"

interface Track {
  id: number
  title: string
  artist: string
  album: string
  album_id: number
  track: number | null
  year: number | null
  added: number
}

function AlbumArtwork({ albumId, albumName, added, missingSince }: { albumId: number; albumName: string; added: number; missingSince?: number | null }) {
  return (
    <div className="relative w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-white/5 flex items-center justify-center">
      {missingSince ? (
        <FileQuestion className="w-5 h-5 text-red-400/60" />
      ) : (
        <Image
          src={`/api/album/${albumId}/art?size=80&t=${added}`}
          alt={albumName}
          fill
          className="object-cover"
          sizes="40px"
          unoptimized
        />
      )}
    </div>
  )
}

interface CommandBarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandBar({ open, onOpenChange }: CommandBarProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [searchResults, setSearchResults] = React.useState<Album[]>([])
  const [trackResults, setTrackResults] = React.useState<Track[]>([])
  const [recentAlbums, setRecentAlbums] = React.useState<Album[]>([])
  const [loading, setLoading] = React.useState(false)
  const hasFetchedRecent = React.useRef(false)

  React.useEffect(() => {
    if (!open || hasFetchedRecent.current) return
    hasFetchedRecent.current = true
    fetch("/api/albums?page=0&pageSize=5")
      .then(r => r.json())
      .then(data => setRecentAlbums(data.albums || []))
      .catch(err => console.error("Failed to fetch recent albums:", err))
  }, [open])

  React.useEffect(() => {
    const fetchResults = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([])
        return
      }

      setLoading(true)
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(searchQuery)}&pageSize=20`
        )
        const data = await response.json()
        setSearchResults(data.albums || [])
        setTrackResults(data.tracks || [])
      } catch (error) {
        console.error("Search failed:", error)
        setSearchResults([])
        setTrackResults([])
      } finally {
        setLoading(false)
      }
    }

    const debounceTimer = setTimeout(fetchResults, 300)
    return () => clearTimeout(debounceTimer)
  }, [searchQuery])

  const handleSelectAlbum = (albumId: number) => {
    router.push(`/album/${albumId}`)
    onOpenChange(false)
    setSearchQuery("")
  }

  const handleSelectTrack = (track: Track) => {
    router.push(`/album/${track.album_id}`)
    onOpenChange(false)
    setSearchQuery("")
  }

  const handleAction = (action: string) => {
    onOpenChange(false)
    setSearchQuery("")
    // TODO: Implement actions
    console.log("Action:", action)
  }

  // Group results by artist
  const groupedResults = React.useMemo(() => {
    const groups: Record<string, Album[]> = {}
    searchResults.forEach((album) => {
      const artist = album.albumartist || "Unknown Artist"
      if (!groups[artist]) {
        groups[artist] = []
      }
      groups[artist].push(album)
    })
    return groups
  }, [searchResults])

  const showSuggestions = !searchQuery.trim()

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search Albums"
      description="Search for albums and artists in your library"
      className="top-[15%] max-w-2xl backdrop-blur-none shadow-2xl bg-zinc-900/95 border-zinc-800"
    >
      <Command shouldFilter={false} className="bg-transparent">
        <CommandInput
          placeholder="Search albums, artists..."
          value={searchQuery}
          onValueChange={setSearchQuery}
          className="h-14 text-base px-4"
        />
        <CommandList>
          {showSuggestions ? (
            <>
              <CommandGroup heading="Quick Actions">
                <CommandItem onSelect={() => router.push("/")} className="py-3">
                  <Library className="mr-3 h-5 w-5 opacity-60" />
                  <span className="text-sm">Browse Library</span>
                </CommandItem>
                <CommandItem onSelect={() => handleAction("import")} className="py-3">
                  <FolderOpen className="mr-3 h-5 w-5 opacity-60" />
                  <span className="text-sm">Import Library</span>
                </CommandItem>
                <CommandItem onSelect={() => handleAction("scan")} className="py-3">
                  <Upload className="mr-3 h-5 w-5 opacity-60" />
                  <span className="text-sm">Scan Files</span>
                </CommandItem>
              </CommandGroup>
              {recentAlbums.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Recently Added">
                    {recentAlbums.map((album) => (
                      <CommandItem
                        key={album.id}
                        value={album.id.toString()}
                        onSelect={() => handleSelectAlbum(album.id)}
                        className="py-3 px-3"
                      >
                        <AlbumArtwork albumId={album.id} albumName={album.album} added={album.added} missingSince={album.missing_since} />
                        <div className="flex flex-col ml-3 flex-1 min-w-0">
                          <span className="font-medium text-sm truncate">{album.album}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {album.albumartist}
                            {album.year && ` • ${album.year}`}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </>
          ) : (
            <>
              <CommandEmpty>
                {loading ? "Searching..." : "No results found."}
              </CommandEmpty>
              {Object.entries(groupedResults).map(([artist, albums]) => (
                <CommandGroup key={artist} heading={artist}>
                  {albums.map((album) => (
                    <CommandItem
                      key={album.id}
                      value={album.id.toString()}
                      onSelect={() => handleSelectAlbum(album.id)}
                      className="py-3 px-3"
                    >
                      <AlbumArtwork albumId={album.id} albumName={album.album} added={album.added} missingSince={album.missing_since} />
                      <div className="flex flex-col ml-3 flex-1 min-w-0">
                        <span className="font-medium text-sm truncate">{album.album}</span>
                        {album.year && (
                          <span className="text-xs text-muted-foreground">
                            {album.year}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {trackResults.length > 0 && (
                <>
                  {searchResults.length > 0 && <CommandSeparator />}
                  <CommandGroup heading="Songs">
                    {trackResults.map((track) => (
                      <CommandItem
                        key={`track-${track.id}`}
                        value={`track-${track.id}`}
                        onSelect={() => handleSelectTrack(track)}
                        className="py-3 px-3"
                      >
                        <AlbumArtwork albumId={track.album_id} albumName={track.album} added={track.added} />
                        <div className="flex flex-col ml-3 flex-1 min-w-0">
                          <span className="font-medium text-sm truncate">{track.title}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {track.artist} · {track.album}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
