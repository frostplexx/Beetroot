import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePreview } from '../contexts/PreviewContext'
import { SearchBar } from '../components/common/SearchBar'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { PaginationControls } from '../components/common/PaginationControls'
import { AlbumGrid } from '../components/albums/AlbumGrid'
import { TrackTable } from '../components/tracks/TrackTable'
import { PreviewPanel } from '../components/tracks/PreviewPanel'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { toast } from 'sonner'

export function Dashboard() {
  const { previewTrack, setPreviewTrack } = usePreview()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('dashboard-active-tab') || 'albums'
  })
  const [searchQuery, setSearchQuery] = useState(() => {
    // Initialize from URL first, then sessionStorage as fallback
    return searchParams.get('q') || sessionStorage.getItem('dashboard-search-query') || ''
  })
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery)
  const [showHelp, setShowHelp] = useState(false)

  // Pagination state with localStorage persistence
  const [albumsPage, setAlbumsPage] = useState(() => {
    const saved = localStorage.getItem('dashboard-albums-page')
    return saved ? parseInt(saved, 10) : 0
  })
  const [itemsPage, setItemsPage] = useState(() => {
    const saved = localStorage.getItem('dashboard-items-page')
    return saved ? parseInt(saved, 10) : 0
  })
  const albumsPerPage = 50
  const itemsPerPage = 100

  // Track sorting state
  const [sortField, setSortField] = useState('title')
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false })
  const [sortDirection, setSortDirection] = useState('asc')

  // Determine if we're searching
  const urlQuery = searchParams.get('q')
  const isSearching = !!(urlQuery && urlQuery.trim())

  // React Query hooks for cached data fetching
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await fetch('/api/beets/stats')
      if (!res.ok) throw new Error(`Stats: ${res.status} ${res.statusText}`)
      return res.json()
    }
  })

  const { data: counts } = useQuery({
    queryKey: ['counts'],
    queryFn: async () => {
      const [albumsRes, itemsRes] = await Promise.all([
        fetch('/api/beets/albums/count'),
        fetch('/api/beets/items/count')
      ])
      const albumsCount = albumsRes.ok ? (await albumsRes.json()).count : 0
      const itemsCount = itemsRes.ok ? (await itemsRes.json()).count : 0
      return { albums: albumsCount, items: itemsCount }
    }
  })

  // Paginated albums (only when not searching)
  const { data: albumsData, isLoading: albumsLoading } = useQuery({
    queryKey: ['albums', albumsPage, albumsPerPage],
    queryFn: async () => {
      const offset = albumsPage * albumsPerPage
      const res = await fetch(`/api/beets/albums?limit=${albumsPerPage}&offset=${offset}`)
      if (!res.ok) throw new Error(`Albums: ${res.status} ${res.statusText}`)
      return res.json()
    },
    enabled: !isSearching
  })

  // Paginated items (only when not searching)
  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['items', itemsPage, itemsPerPage],
    queryFn: async () => {
      const offset = itemsPage * itemsPerPage
      const res = await fetch(`/api/beets/items?limit=${itemsPerPage}&offset=${offset}`)
      if (!res.ok) throw new Error(`Items: ${res.status} ${res.statusText}`)
      return res.json()
    },
    enabled: !isSearching
  })

  // Search results (only when searching)
  const { data: searchData, isLoading: searchLoading, error: searchError } = useQuery({
    queryKey: ['search', urlQuery],
    queryFn: async () => {
      const [albumsRes, itemsRes] = await Promise.all([
        fetch(`/api/beets/search/albums?q=${encodeURIComponent(urlQuery)}`),
        fetch(`/api/beets/search/items?q=${encodeURIComponent(urlQuery)}`)
      ])
      if (!albumsRes.ok) throw new Error(`Search Albums: ${albumsRes.status}`)
      if (!itemsRes.ok) throw new Error(`Search Items: ${itemsRes.status}`)
      const albums = await albumsRes.json()
      const items = await itemsRes.json()
      return { albums: albums || [], items: items || [] }
    },
    enabled: isSearching
  })

  // Derive albums and items from either search or paginated data
  const albums = isSearching ? (searchData?.albums || []) : (albumsData || [])
  const items = isSearching ? (searchData?.items || []) : (itemsData || [])
  const albumsTotal = counts?.albums || 0
  const itemsTotal = counts?.items || 0
  const loading = isSearching ? searchLoading : (albumsLoading || itemsLoading)
  const error = searchError

  // Persist active tab to localStorage and scroll to top when changing tabs
  useEffect(() => {
    localStorage.setItem('dashboard-active-tab', activeTab)
    // Don't scroll to top on initial mount, only when tab changes
    if (albums.length > 0 || items.length > 0) {
      window.scrollTo(0, 0)
    }
  }, [activeTab])

  // Persist pagination to localStorage and scroll to top on page change
  useEffect(() => {
    localStorage.setItem('dashboard-albums-page', albumsPage.toString())
    // Scroll to top when changing pages (but not on initial mount)
    if (albums.length > 0) {
      window.scrollTo(0, 0)
    }
  }, [albumsPage])

  useEffect(() => {
    localStorage.setItem('dashboard-items-page', itemsPage.toString())
    // Scroll to top when changing pages (but not on initial mount)
    if (items.length > 0) {
      window.scrollTo(0, 0)
    }
  }, [itemsPage])

  // Debounce search query (wait 400ms after user stops typing)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 400)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Auto-trigger search when debounced query changes
  useEffect(() => {
    // Skip on initial mount if query matches URL (already loaded)
    const urlQuery = searchParams.get('q') || ''
    if (debouncedQuery !== urlQuery) {
      handleSearch(debouncedQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery])

  // Persist search query to sessionStorage
  useEffect(() => {
    if (searchQuery) {
      sessionStorage.setItem('dashboard-search-query', searchQuery)
    } else {
      sessionStorage.removeItem('dashboard-search-query')
    }
  }, [searchQuery])

  // On mount, restore search from sessionStorage if not in URL
  useEffect(() => {
    const urlQuery = searchParams.get('q')
    const sessionQuery = sessionStorage.getItem('dashboard-search-query')
    if (!urlQuery && sessionQuery && sessionQuery.trim()) {
      setSearchQuery(sessionQuery)
      setDebouncedQuery(sessionQuery)
      setSearchParams({ q: sessionQuery })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save scroll position before unmounting
  useEffect(() => {
    return () => {
      sessionStorage.setItem('dashboard-scroll-position', window.scrollY.toString())
    }
  }, [])

  // Restore scroll position after content loads
  useEffect(() => {
    if (!loading && (albums.length > 0 || items.length > 0)) {
      const savedPosition = sessionStorage.getItem('dashboard-scroll-position')
      if (savedPosition) {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          window.scrollTo(0, parseInt(savedPosition, 10))
          sessionStorage.removeItem('dashboard-scroll-position')
        })
      }
    }
  }, [loading, albums, items])


  const sortItems = (itemsToSort, field, direction) => {
    const sorted = [...itemsToSort].sort((a, b) => {
      let aVal, bVal

      // Handle special cases for nullable fields
      switch (field) {
        case 'title':
          aVal = a.title || ''
          bVal = b.title || ''
          break
        case 'artist':
          aVal = a.artist || ''
          bVal = b.artist || ''
          break
        case 'album':
          aVal = a.album || ''
          bVal = b.album || ''
          break
        case 'year':
          aVal = a.year?.Valid ? a.year.Int64 : 0
          bVal = b.year?.Valid ? b.year.Int64 : 0
          break
        case 'length':
          aVal = a.length || 0
          bVal = b.length || 0
          break
        case 'format':
          aVal = a.format || ''
          bVal = b.format || ''
          break
        default:
          return 0
      }

      // String comparison
      if (typeof aVal === 'string') {
        return direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }

      // Number comparison
      return direction === 'asc' ? aVal - bVal : bVal - aVal
    })

    return sorted
  }

  const handleSort = (field) => {
    const newDirection = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc'
    setSortField(field)
    setSortDirection(newDirection)
  }

  // User-triggered search that updates the URL
  const handleSearch = (query) => {
    if (!query.trim()) {
      setSearchParams({})
      setAlbumsPage(0)
      setItemsPage(0)
      return
    }
    setSearchParams({ q: query })
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    handleSearch(searchQuery)
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchParams({})
    setAlbumsPage(0)
    setItemsPage(0)
  }

  // Apply sorting to items
  const sortedItems = sortItems(items, sortField, sortDirection)

  // Only show full-screen loader on initial load (not when searching)
  const isInitialLoad = loading && !albums.length && !items.length && !isSearching && !searchQuery
  if (isInitialLoad) {
    return <LoadingSpinner message="Loading library..." />
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6">
        <div className="border border-red-900/50 bg-red-950/20 rounded-xl p-8 max-w-lg w-full">
          <h2 className="text-xl font-bold text-red-200">System Error</h2>
          <p className="text-red-400 mt-2">{error.message || String(error)}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-neutral-900 rounded text-neutral-200">
            Retry
          </button>
        </div>
      </div>
    )
  }

  const handleDeleteTrack = (track) => {
    // Close preview panel first
    setPreviewTrack(null)

    // Show delete dialog
    setDeleteDialog({
      isOpen: true,
      title: 'Delete Track',
      message: `Delete "${track.title}" by ${track.artist}?\n\nChoose how you want to delete this track:`,
      buttons: [
        {
          label: 'Cancel',
          variant: 'secondary',
          onClick: () => {}
        },
        {
          label: 'Library Only',
          variant: 'primary',
          onClick: () => performDeleteTrack(track.id, false)
        },
        {
          label: 'Delete File',
          variant: 'danger',
          onClick: () => performDeleteTrack(track.id, true)
        }
      ]
    })
  }

  const performDeleteTrack = async (trackId, deleteFiles) => {
    try {
      const response = await fetch('/api/beets/delete/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: trackId,
          delete_files: deleteFiles
        })
      })

      if (!response.ok) throw new Error('Failed to delete track')

      toast.success('Track deleted successfully!')
      // Refetch the data
      setTimeout(() => {
        itemsQuery.refetch()
      }, 500)
    } catch (err) {
      toast.error('Error: ' + err.message)
    }
  }

  return (
    <>
      <div className="w-full px-6 py-6 md:py-8">
        <div className="w-full">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* Control Bar with Tabs, Count, Search, and Pagination */}
            <div className="flex flex-wrap items-center gap-4 mb-6 py-2">
              {/* Left: Tabs + Count */}
              <div className="flex items-center gap-4">
                <TabsList>
                  <TabsTrigger value="albums">Albums</TabsTrigger>
                  <TabsTrigger value="tracks">Tracks</TabsTrigger>
                </TabsList>

                {/* Count */}
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {isSearching ? (
                    activeTab === 'albums'
                      ? `${albums.length} results`
                      : `${sortedItems.length} results`
                  ) : (
                    activeTab === 'albums'
                      ? `${albumsTotal.toLocaleString()} albums`
                      : `${itemsTotal.toLocaleString()} tracks`
                  )}
                </span>
              </div>

              {/* Middle: Search Bar */}
              <div className="flex-1 min-w-[300px]">
                <SearchBar
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  handleSearchSubmit={handleSearchSubmit}
                  clearSearch={clearSearch}
                  searching={loading}
                  showHelp={showHelp}
                  setShowHelp={setShowHelp}
                  handleSearch={handleSearch}
                />
              </div>

              {/* Right: Pagination (hidden when searching) */}
              {!isSearching && activeTab === 'albums' && (
                <PaginationControls
                  currentPage={albumsPage}
                  totalItems={albumsTotal}
                  itemsPerPage={albumsPerPage}
                  onPageChange={setAlbumsPage}
                />
              )}
              {!isSearching && activeTab === 'tracks' && (
                <PaginationControls
                  currentPage={itemsPage}
                  totalItems={itemsTotal}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setItemsPage}
                />
              )}
            </div>

            <TabsContent value="albums">
              {loading && albums.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <LoadingSpinner message="Loading albums..." />
                </div>
              ) : (
                <AlbumGrid albums={albums} />
              )}
            </TabsContent>

            <TabsContent value="tracks">
              {loading && sortedItems.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <LoadingSpinner message="Loading tracks..." />
                </div>
              ) : (
                <TrackTable
                  items={sortedItems}
                  currentPage={itemsPage}
                  itemsPerPage={itemsPerPage}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
              )}
            </TabsContent>

            {/* Bottom Pagination */}
            {!isSearching && (albums.length > 0 || sortedItems.length > 0) && (
              <div className="mt-8 flex justify-center">
                {activeTab === 'albums' && (
                  <PaginationControls
                    currentPage={albumsPage}
                    totalItems={albumsTotal}
                    itemsPerPage={albumsPerPage}
                    onPageChange={setAlbumsPage}
                  />
                )}
                {activeTab === 'tracks' && (
                  <PaginationControls
                    currentPage={itemsPage}
                    totalItems={itemsTotal}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setItemsPage}
                  />
                )}
              </div>
            )}
          </Tabs>

          {/* Song Info Drawer */}
          <Drawer open={!!previewTrack} onOpenChange={(open) => !open && setPreviewTrack(null)}>
            <DrawerContent className="max-h-[90vh] overflow-auto">
              {previewTrack && (
                <PreviewPanel
                  key={previewTrack.id}
                  track={previewTrack}
                  onClose={() => setPreviewTrack(null)}
                  setPreviewTrack={setPreviewTrack}
                  onDeleteTrack={handleDeleteTrack}
                />
              )}
            </DrawerContent>
          </Drawer>

          <ConfirmDialog
            isOpen={deleteDialog.isOpen}
            onClose={() => setDeleteDialog({ isOpen: false })}
            title={deleteDialog.title}
            message={deleteDialog.message}
            buttons={deleteDialog.buttons || []}
          />
        </div>
      </div>
    </>
  )
}
