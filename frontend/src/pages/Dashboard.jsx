import { useState, useEffect } from 'react'
import { usePreview } from '../contexts/PreviewContext'
import { Header } from '../components/common/Header'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { StatCard } from '../components/common/StatCard'
import { AlbumGrid } from '../components/albums/AlbumGrid'
import { TrackTable } from '../components/tracks/TrackTable'
import { PreviewPanel } from '../components/tracks/PreviewPanel'
import { formatDurationLong } from '../utils/formatters'

export function Dashboard() {
  const { previewTrack, setPreviewTrack } = usePreview()
  const [stats, setStats] = useState(null)
  const [albums, setAlbums] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('albums')
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  // Pagination state
  const [albumsPage, setAlbumsPage] = useState(0)
  const [itemsPage, setItemsPage] = useState(0)
  const [albumsTotal, setAlbumsTotal] = useState(0)
  const [itemsTotal, setItemsTotal] = useState(0)
  const albumsPerPage = 50
  const itemsPerPage = 100

  useEffect(() => {
    loadStats()
    loadCounts()
  }, [])

  useEffect(() => {
    if (activeTab === 'albums') {
      loadAlbums(albumsPage)
    } else if (activeTab === 'tracks') {
      loadItems(itemsPage)
    }
  }, [activeTab, albumsPage, itemsPage])

  const loadStats = async () => {
    try {
      const res = await fetch('/api/beets/stats')
      if (!res.ok) throw new Error(`Stats: ${res.status} ${res.statusText}`)
      const data = await res.json()
      setStats(data)
    } catch (err) {
      setError(err.message)
    }
  }

  const loadCounts = async () => {
    try {
      const [albumsRes, itemsRes] = await Promise.all([
        fetch('/api/beets/albums/count'),
        fetch('/api/beets/items/count')
      ])
      if (albumsRes.ok) {
        const data = await albumsRes.json()
        setAlbumsTotal(data.count)
      }
      if (itemsRes.ok) {
        const data = await itemsRes.json()
        setItemsTotal(data.count)
      }
    } catch (err) {
      console.error('Error loading counts:', err)
    }
  }

  const loadAlbums = async (page) => {
    setLoading(true)
    try {
      const offset = page * albumsPerPage
      const res = await fetch(`/api/beets/albums?limit=${albumsPerPage}&offset=${offset}`)
      if (!res.ok) throw new Error(`Albums: ${res.status} ${res.statusText}`)
      const data = await res.json()
      setAlbums(data || [])
      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const loadItems = async (page) => {
    setLoading(true)
    try {
      const offset = page * itemsPerPage
      const res = await fetch(`/api/beets/items?limit=${itemsPerPage}&offset=${offset}`)
      if (!res.ok) throw new Error(`Items: ${res.status} ${res.statusText}`)
      const data = await res.json()
      setItems(data || [])
      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const loadAllData = () => {
    setAlbumsPage(0)
    setItemsPage(0)
    loadStats()
    loadCounts()
    if (activeTab === 'albums') {
      loadAlbums(0)
    } else {
      loadItems(0)
    }
  }

  const handleSearch = async (query) => {
    if (!query.trim()) {
      loadAllData()
      return
    }

    setSearching(true)
    try {
      const [albumsData, itemsData] = await Promise.all([
        fetch(`/api/beets/search/albums?q=${encodeURIComponent(query)}`).then(res => {
          if (!res.ok) throw new Error(`Search Albums: ${res.status} ${res.statusText}`)
          return res.json()
        }),
        fetch(`/api/beets/search/items?q=${encodeURIComponent(query)}`).then(res => {
          if (!res.ok) throw new Error(`Search Items: ${res.status} ${res.statusText}`)
          return res.json()
        })
      ])
      setAlbums(albumsData || [])
      setItems(itemsData || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    handleSearch(searchQuery)
  }

  const clearSearch = () => {
    setSearchQuery('')
    loadAllData()
  }

  if (loading && !albums.length && !items.length) {
    return <LoadingSpinner message="Loading library..." />
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6">
        <div className="border border-red-900/50 bg-red-950/20 rounded-xl p-8 max-w-lg w-full">
          <h2 className="text-xl font-bold text-red-200">System Error</h2>
          <p className="text-red-400 mt-2">{error}</p>
          <button onClick={loadAllData} className="mt-4 px-4 py-2 bg-neutral-900 rounded text-neutral-200">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        handleSearchSubmit={handleSearchSubmit}
        clearSearch={clearSearch}
        searching={searching}
        showHelp={showHelp}
        setShowHelp={setShowHelp}
        handleSearch={handleSearch}
      />

      <div className="mx-auto px-3 py-4 md:py-8 w-full max-w-[1800px] lg:max-w-[calc(min(1800px,100vw-512px))]">
        <div className="w-full">
          <div>
            {activeTab === 'stats' && stats && (
              <div>
                <h2 className="text-sm font-medium text-neutral-400 mb-3 md:mb-4 uppercase tracking-wider">
                  Library Statistics
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                  <StatCard title="Albums" value={stats.total_albums?.toLocaleString() || 0} />
                  <StatCard title="Tracks" value={stats.total_items?.toLocaleString() || 0} />
                  <StatCard title="Artists" value={stats.total_artists?.toLocaleString() || 0} />
                  <StatCard
                    title="Duration"
                    value={stats.total_duration_seconds ? formatDurationLong(stats.total_duration_seconds) : '0m'}
                  />
                </div>
              </div>
            )}

            {activeTab === 'albums' && (
              <AlbumGrid
                albums={albums}
                currentPage={albumsPage}
                totalAlbums={albumsTotal}
                albumsPerPage={albumsPerPage}
                onPageChange={setAlbumsPage}
              />
            )}

            {activeTab === 'tracks' && (
              <TrackTable
                items={items}
                currentPage={itemsPage}
                totalItems={itemsTotal}
                itemsPerPage={itemsPerPage}
                onPageChange={setItemsPage}
              />
            )}
          </div>

          {/* Mobile backdrop overlay */}
          {previewTrack && (
            <div
              className="fixed inset-0 bg-black/60 z-30 lg:hidden transition-opacity duration-300"
              onClick={() => setPreviewTrack(null)}
            />
          )}

          {/* Mobile: bottom sheet, Desktop: right sidebar */}
          <div className={`fixed bottom-0 left-0 right-0 max-h-[85vh] rounded-t-xl border-t border-neutral-800 bg-neutral-900 backdrop-blur-sm z-40 overflow-y-auto transition-transform duration-300 ${previewTrack ? 'translate-y-0' : 'translate-y-full'} lg:top-32 lg:bottom-auto lg:right-0 lg:left-auto lg:w-[480px] lg:h-[calc(100vh-8rem)] lg:rounded-none lg:border-l lg:border-t-0 ${previewTrack ? 'lg:translate-y-0 lg:translate-x-0' : 'lg:translate-y-0 lg:translate-x-full'}`}>
            {previewTrack && (
              <PreviewPanel
                key={previewTrack.id}
                track={previewTrack}
                onClose={() => setPreviewTrack(null)}
                setPreviewTrack={setPreviewTrack}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
