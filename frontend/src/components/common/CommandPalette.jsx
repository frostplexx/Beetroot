import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [albums, setAlbums] = useState([])
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  // Keyboard shortcut
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // Load data when opened (lazy loading)
  useEffect(() => {
    if (open && albums.length === 0 && tracks.length === 0) {
      setLoading(true)
      Promise.all([
        fetch('/api/beets/albums?limit=100').then(r => r.ok ? r.json() : []),
        fetch('/api/beets/items?limit=100').then(r => r.ok ? r.json() : [])
      ])
        .then(([albumsData, itemsData]) => {
          setAlbums(albumsData || [])
          setTracks(itemsData || [])
        })
        .catch(err => {
          console.error('Failed to load command palette data:', err)
        })
        .finally(() => setLoading(false))
    }
  }, [open, albums.length, tracks.length])

  const runCommand = (callback) => {
    setOpen(false)
    callback()
  }

  const pages = [
    { name: 'Dashboard', path: '/', icon: 'fa-solid fa-home', keywords: 'home albums tracks library' },
    { name: 'Tools', path: '/tools', icon: 'fa-solid fa-toolbox', keywords: 'duplicates missing art replaygain' },
    { name: 'Upload', path: '/upload', icon: 'fa-solid fa-upload', keywords: 'import add music files' },
    { name: 'System', path: '/system', icon: 'fa-solid fa-cog', keywords: 'settings config logs stats health' },
  ]

  return (
    <CommandDialog open={open} onOpenChange={setOpen} className="sm:max-w-4xl">
      <Command className="!bg-neutral-900 !text-neutral-100 rounded-lg border-0 [&_[cmdk-input-wrapper]]:!bg-neutral-900 [&_[data-slot=input-group]]:!bg-neutral-900 [&_[data-slot=input-group]]:!border-neutral-800">
        <CommandInput
          placeholder="Type to search albums, tracks, or navigate..."
          value={search}
          onValueChange={setSearch}
          className="!border-0 !bg-transparent !text-neutral-100 placeholder:!text-neutral-500 h-14 px-4 text-base"
        />
        <CommandList className="max-h-[500px]">
        <CommandEmpty className="py-6 text-center text-sm text-neutral-500">
          {loading ? 'Loading...' : 'No results found.'}
        </CommandEmpty>

        {/* Navigation */}
        <CommandGroup heading="Navigation" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:!text-neutral-500 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider">
          {pages.map((page) => (
            <CommandItem
              key={page.path}
              value={`${page.name} ${page.keywords}`}
              onSelect={() => runCommand(() => navigate(page.path))}
              className="mx-2 px-3 py-3 !text-neutral-200 rounded-md aria-selected:!bg-rose-500/20 aria-selected:!text-rose-300 cursor-pointer"
            >
              <i className={`${page.icon} w-5 h-5 mr-3`} />
              <span className="font-medium">{page.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Albums */}
        {albums.length > 0 && (
          <>
            <CommandSeparator className="!bg-neutral-800" />
            <CommandGroup heading="Albums" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:!text-neutral-500 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider">
              {albums.slice(0, 50).map((album) => (
                <CommandItem
                  key={album.id}
                  value={`${album.album} ${album.albumartist}`}
                  onSelect={() => runCommand(() => navigate(`/album/${album.id}`))}
                  className="mx-2 px-3 py-3 !text-neutral-200 rounded-md aria-selected:!bg-rose-500/20 aria-selected:!text-rose-300 cursor-pointer"
                >
                  <i className="fa-solid fa-record-vinyl w-5 h-5 mr-3 text-rose-500" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-medium truncate">{album.album}</span>
                    <span className="text-xs !text-neutral-500 truncate">{album.albumartist}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Tracks */}
        {tracks.length > 0 && (
          <>
            <CommandSeparator className="!bg-neutral-800" />
            <CommandGroup heading="Tracks" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:!text-neutral-500 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider">
              {tracks.slice(0, 30).map((track) => (
                <CommandItem
                  key={track.id}
                  value={`${track.title} ${track.artist} ${track.album}`}
                  onSelect={() => {
                    if (track.album_id?.Valid) {
                      runCommand(() => navigate(`/album/${track.album_id.Int64}`))
                    }
                  }}
                  className="mx-2 px-3 py-3 !text-neutral-200 rounded-md aria-selected:!bg-rose-500/20 aria-selected:!text-rose-300 cursor-pointer"
                >
                  <i className="fa-solid fa-music w-5 h-5 mr-3 text-rose-400" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-medium truncate">{track.title}</span>
                    <span className="text-xs !text-neutral-500 truncate">
                      {track.artist} • {track.album}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
