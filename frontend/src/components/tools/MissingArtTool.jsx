import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../common/Header'

export function MissingArtTool() {
  const navigate = useNavigate()
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(null)

  useEffect(() => {
    loadMissingArt()
  }, [])

  const loadMissingArt = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/beets/tools/missing-art')
      const data = await response.json()
      setAlbums(data.albums || [])
    } catch (err) {
      console.error('Error loading missing art:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFetchArt = async (albumId) => {
    setFetching(albumId)
    try {
      const response = await fetch('/api/beets/tools/fetch-art', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: albumId })
      })

      if (!response.ok) throw new Error('Failed to fetch art')

      alert('Album art fetched successfully!')
      loadMissingArt()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setFetching(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950">
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-rose-500 border-r-transparent"></div>
            <p className="mt-4 text-neutral-500 text-sm">Scanning for missing album art...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <button
          onClick={() => navigate('/tools')}
          className="mb-6 text-sm text-neutral-500 hover:text-neutral-300 flex items-center gap-2"
        >
          <i className="fa-solid fa-arrow-left"></i>
          Back to Tools
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-light text-neutral-200 mb-2">Missing Album Art</h1>
          <p className="text-sm text-neutral-400">
            {albums.length === 0
              ? 'All albums have cover art'
              : `Found ${albums.length} album${albums.length !== 1 ? 's' : ''} without cover art`}
          </p>
        </div>

        {albums.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {albums.map((album) => (
              <div
                key={album.id}
                className="bg-neutral-900 border border-neutral-800 rounded overflow-hidden"
              >
                <div className="aspect-square bg-neutral-800 flex items-center justify-center">
                  <i className="fa-solid fa-image text-4xl text-neutral-700"></i>
                </div>
                <div className="p-3">
                  <p className="text-sm text-neutral-200 font-medium truncate">{album.album}</p>
                  <p className="text-xs text-neutral-500 truncate">{album.albumartist}</p>
                  <button
                    onClick={() => handleFetchArt(album.id)}
                    disabled={fetching === album.id}
                    className="mt-2 w-full px-3 py-1.5 text-xs bg-rose-500 text-white rounded hover:bg-rose-600 disabled:opacity-50 transition-colors"
                  >
                    {fetching === album.id ? 'Fetching...' : 'Fetch Art'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 border border-neutral-800 rounded p-4 bg-neutral-900/50">
          <h3 className="text-sm font-medium text-neutral-300 mb-2">How it works</h3>
          <ul className="text-xs text-neutral-500 space-y-1">
            <li>• Scans your library for albums without embedded cover art</li>
            <li>• Click "Fetch Art" to automatically download cover art from online sources</li>
            <li>• Uses MusicBrainz, Cover Art Archive, and other sources</li>
            <li>• Embeds the artwork directly into your audio files</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
