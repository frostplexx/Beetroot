import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Header } from '../components/common/Header'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { formatDuration } from '../utils/formatters'
import { usePreview } from '../contexts/PreviewContext'
import { PreviewPanel } from '../components/tracks/PreviewPanel'
import { EditMetadataModal } from '../components/albums/EditMetadataModal'

export function AlbumDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { previewTrack, setPreviewTrack } = usePreview()
  const [album, setAlbum] = useState(null)
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [artError, setArtError] = useState(false)
  const [artTimestamp, setArtTimestamp] = useState(Date.now())
  const [refetchingArt, setRefetchingArt] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [dominantColor, setDominantColor] = useState(null)

  useEffect(() => {
    loadAlbumData()
  }, [id])

  const loadAlbumData = () => {
    const albumId = parseInt(id)
    Promise.all([
      fetch(`/api/beets/albums/by-id/${albumId}`).then(res => res.json()),
      fetch(`/api/beets/items/by-album/${albumId}`).then(res => res.json())
    ])
      .then(([albumData, itemsData]) => {
        setAlbum(albumData)
        setTracks(itemsData)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }


  const handleRefetchArt = async () => {
    if (!confirm('Refetch album art? This will search for and download cover art.')) return

    setRefetchingArt(true)
    try {
      const response = await fetch('/api/beets/refetch-art', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: parseInt(id) })
      })

      if (!response.ok) throw new Error('Failed to refetch album art')

      setArtError(false)
      setArtTimestamp(Date.now())
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setRefetchingArt(false)
    }
  }



  const extractDominantColor = (imgElement) => {
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      canvas.width = imgElement.width
      canvas.height = imgElement.height
      ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let r = 0, g = 0, b = 0, count = 0

      // Sample every 10th pixel for performance
      for (let i = 0; i < imageData.length; i += 40) {
        r += imageData[i]
        g += imageData[i + 1]
        b += imageData[i + 2]
        count++
      }

      r = Math.floor(r / count)
      g = Math.floor(g / count)
      b = Math.floor(b / count)

      // Darken the color for better contrast
      r = Math.floor(r * 0.4)
      g = Math.floor(g * 0.4)
      b = Math.floor(b * 0.4)

      return `rgb(${r}, ${g}, ${b})`
    } catch (err) {
      console.error('Failed to extract color:', err)
      return null
    }
  }

  if (loading) {
    return <LoadingSpinner message="Loading album..." />
  }

  if (error || !album) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-neutral-400">Album not found</p>
          <button onClick={() => navigate('/')} className="mt-4 text-rose-500 hover:underline">
            Go back
          </button>
        </div>
      </div>
    )
  }

  const totalDuration = tracks.reduce((sum, track) => sum + (track.length || 0), 0)

  return (
    <div
      className="min-h-screen transition-colors duration-700"
      style={{
        background: dominantColor
          ? `linear-gradient(to bottom, ${dominantColor} 0%, rgba(10, 10, 10, 0.95) 60%, rgb(10, 10, 10) 100%)`
          : 'rgb(10, 10, 10)'
      }}
    >
      <Header />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-8">
          <div className="flex-1">
            <button
              onClick={() => navigate('/')}
              className="mb-6 text-sm text-neutral-500 hover:text-neutral-300 flex items-center gap-2"
            >
              <i className="fa-solid fa-arrow-left"></i>
              Back to Library
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
              {/* Album Art */}
              <div className="lg:col-span-1">
                <div className="aspect-square bg-neutral-900 border border-neutral-800 rounded overflow-hidden mb-2 flex items-center justify-center">
                  {!artError ? (
                    <img
                      src={`/api/beets/albums/${album.id}/art${artTimestamp ? `?t=${artTimestamp}` : ''}`}
                      alt={album.album}
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                      onLoad={(e) => {
                        const color = extractDominantColor(e.target)
                        if (color) setDominantColor(color)
                      }}
                      onError={() => setArtError(true)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <i className="fa-solid fa-compact-disc text-4xl text-neutral-700"></i>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleRefetchArt}
                    disabled={refetchingArt}
                    className="flex-1 px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-800 rounded text-neutral-400 hover:border-rose-500 hover:text-rose-500 disabled:opacity-50 transition-colors"
                  >
                    {refetchingArt ? 'Refetching...' : 'Refetch Art'}
                  </button>
                  <label className="flex-1 px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-800 rounded text-neutral-400 hover:border-rose-500 hover:text-rose-500 text-center cursor-pointer transition-colors">
                    Upload Art
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) alert('Album art upload coming soon!')
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Album Info */}
              <div className="lg:col-span-2">
                <h1 className="text-3xl font-light text-neutral-100 mb-2">{album.album}</h1>
                <p className="text-xl text-neutral-400 mb-4">{album.albumartist}</p>

                {/* Metadata Tools */}
                <div className="flex gap-2 mb-6">
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="px-3 py-1.5 text-sm bg-neutral-900 border border-neutral-800 rounded text-neutral-300 hover:border-rose-500 hover:text-rose-500 transition-colors"
                  >
                    Edit Metadata
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                  {album.year?.Valid && (
                    <div>
                      <span className="text-neutral-500">Year</span>
                      <p className="text-neutral-200">{album.year.Int64}</p>
                    </div>
                  )}
                  {album.label?.Valid && (
                    <div>
                      <span className="text-neutral-500">Label</span>
                      <p className="text-neutral-200">{album.label.String}</p>
                    </div>
                  )}
                  {album.genres?.Valid && (
                    <div>
                      <span className="text-neutral-500 block mb-1">Genre</span>
                      <div className="flex flex-wrap gap-1">
                        {album.genres.String.split(String.fromCharCode(0)).filter(g => g.trim()).map((genre, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 text-xs bg-neutral-800 text-neutral-300 rounded"
                          >
                            {genre}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {album.country?.Valid && (
                    <div>
                      <span className="text-neutral-500">Country</span>
                      <p className="text-neutral-200">{album.country.String}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-neutral-500">Tracks</span>
                    <p className="text-neutral-200">{tracks.length}</p>
                  </div>
                  <div>
                    <span className="text-neutral-500">Duration</span>
                    <p className="text-neutral-200">{formatDuration(totalDuration)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Track List */}
            <div>
              <h2 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider">
                Tracks
              </h2>
              <div className="border border-neutral-900 rounded overflow-hidden">
                <table className="w-full">
                  <thead className="bg-neutral-900/50 border-b border-neutral-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">#</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Artist</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-900">
                    {tracks.map((track) => (
                      <tr
                        key={track.id}
                        onClick={() => setPreviewTrack(track)}
                        className="hover:bg-neutral-900/30 cursor-pointer group"
                      >
                        <td className="px-4 py-3 text-sm font-mono relative">
                          <i className="fa-solid fa-play text-xs opacity-0 group-hover:opacity-100 transition-opacity absolute left-4 text-rose-500"></i>
                          <span className={`group-hover:opacity-0 transition-opacity ${previewTrack?.id === track.id ? 'text-rose-500' : 'text-neutral-500'}`}>
                            {track.track?.Valid ? track.track.Int64 : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-200 group-hover:text-rose-400">
                          {track.title}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-400">{track.artist}</td>
                        <td className="px-4 py-3 text-sm text-neutral-500 font-mono text-right">
                          {track.length ? formatDuration(track.length) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modals */}
            <EditMetadataModal
              album={album}
              isOpen={showEditModal}
              onClose={() => setShowEditModal(false)}
              onSave={loadAlbumData}
            />
          </div>

          {previewTrack && (
            <div className="w-[480px] border-l border-neutral-800 bg-neutral-900/50">
              <PreviewPanel
                track={previewTrack}
                onClose={() => setPreviewTrack(null)}
                setPreviewTrack={setPreviewTrack}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
