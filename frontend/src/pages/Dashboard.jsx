import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePreview } from '../contexts/PreviewContext'
import { SearchBar } from '../components/common/SearchBar'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { Pagination } from '../components/common/Pagination'
import { AlbumGrid } from '../components/albums/AlbumGrid'
import { TrackTable } from '../components/tracks/TrackTable'
import { PreviewPanel } from '../components/tracks/PreviewPanel'
import { ResizablePreviewPanel } from '../components/common/ResizablePreviewPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

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

  return (
    <>
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

      <div className="mx-auto px-3 py-4 md:py-8 w-full max-w-[1800px] lg:max-w-[calc(min(1800px,100vw-512px))]">
        <div className="w-full">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* Control Bar with Tabs + Pagination */}
            <div className="flex items-center justify-between mb-6">
              {/* Left: Tabs */}
              <div className="flex items-center gap-4">
                <TabsList>
                  <TabsTrigger value="albums">Albums</TabsTrigger>
                  <TabsTrigger value="tracks">Tracks</TabsTrigger>
                </TabsList>

                {/* Count */}
                <span className="text-sm text-muted-foreground">
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

              {/* Right: Pagination (hidden when searching) */}
              {!isSearching && activeTab === 'albums' && (
                <Pagination
                  currentPage={albumsPage}
                  totalItems={albumsTotal}
                  itemsPerPage={albumsPerPage}
                  onPageChange={setAlbumsPage}
                />
              )}
              {!isSearching && activeTab === 'tracks' && (
                <Pagination
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
          </Tabs>

          {/* Mobile backdrop overlay */}
          {previewTrack && (
            <div
              className="fixed inset-0 bg-black/60 z-30 lg:hidden transition-opacity duration-300"
              onClick={() => setPreviewTrack(null)}
            />
          )}

          {/* Mobile: bottom sheet, Desktop: resizable right sidebar */}
          <ResizablePreviewPanel
            isOpen={!!previewTrack}
            className={`fixed bottom-0 left-0 right-0 h-[85vh] rounded-t-xl border-t border-neutral-800 bg-neutral-900 backdrop-blur-sm z-40 overflow-hidden transition-transform duration-300 ${previewTrack ? 'translate-y-0' : 'translate-y-full'} lg:top-32 lg:bottom-0 lg:right-0 lg:left-auto lg:h-auto lg:rounded-none lg:border-l lg:border-t-0 ${previewTrack ? 'lg:translate-y-0 lg:translate-x-0' : 'lg:translate-y-0 lg:translate-x-full'}`}
          >
            {previewTrack && (
              <PreviewPanel
                key={previewTrack.id}
                track={previewTrack}
                onClose={() => setPreviewTrack(null)}
                setPreviewTrack={setPreviewTrack}
              />
            )}
          </ResizablePreviewPanel>
        </div>
      </div>
    </>
  )
}
