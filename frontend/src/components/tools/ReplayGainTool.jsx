import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function ReplayGainTool() {
  const navigate = useNavigate()
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)

  useEffect(() => {
    loadAlbums()
  }, [])

  const loadAlbums = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/beets/albums?limit=50&offset=0')
      const data = await response.json()
      setAlbums(data || [])
    } catch (err) {
      console.error('Error loading albums:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCalculateReplayGain = async (albumId) => {
    setProcessing(albumId)
    try {
      const response = await fetch('/api/beets/tools/replaygain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: albumId })
      })

      if (!response.ok) throw new Error('Failed to calculate ReplayGain')

      alert('ReplayGain tags calculated successfully!')
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setProcessing(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-rose-500 border-r-transparent"></div>
            <p className="mt-4 text-neutral-500 text-sm">Loading albums...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <button
          onClick={() => navigate('/tools')}
          className="mb-6 text-sm text-neutral-500 hover:text-neutral-300 flex items-center gap-2"
        >
          <i className="fa-solid fa-arrow-left"></i>
          Back to Tools
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-light text-neutral-200 mb-2">ReplayGain</h1>
          <p className="text-sm text-neutral-400">
            Calculate and apply ReplayGain tags for volume normalization
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
                  {album.artpath?.Valid ? (
                    <img
                      src={`/api/beets/albums/${album.id}/art`}
                      alt={album.album}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none'
                        e.target.parentElement.innerHTML = '<i class="fa-solid fa-compact-disc text-4xl text-neutral-700"></i>'
                      }}
                    />
                  ) : (
                    <i className="fa-solid fa-compact-disc text-4xl text-neutral-700"></i>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm text-neutral-200 font-medium truncate">{album.album}</p>
                  <p className="text-xs text-neutral-500 truncate">{album.albumartist}</p>
                  <button
                    onClick={() => handleCalculateReplayGain(album.id)}
                    disabled={processing === album.id}
                    className="mt-2 w-full px-3 py-1.5 text-xs bg-rose-500 text-white rounded hover:bg-rose-600 disabled:opacity-50 transition-colors"
                  >
                    {processing === album.id ? 'Processing...' : 'Calculate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 border border-neutral-800 rounded p-4 bg-neutral-900/50">
          <h3 className="text-sm font-medium text-neutral-300 mb-2">How it works</h3>
          <ul className="text-xs text-neutral-500 space-y-1">
            <li>• Analyzes audio files to calculate optimal playback volume</li>
            <li>• Adds ReplayGain tags for consistent volume across tracks</li>
            <li>• Prevents jarring volume differences when switching songs</li>
            <li>• Requires the replaygain plugin to be enabled</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
