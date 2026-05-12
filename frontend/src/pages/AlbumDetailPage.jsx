import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Header } from '../components/common/Header'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { formatDuration } from '../utils/formatters'
import { usePreview } from '../contexts/PreviewContext'
import { PreviewPanel } from '../components/tracks/PreviewPanel'

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
    <div className="min-h-screen bg-neutral-950">
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

            <div className="flex gap-6 mb-8">
              <div className="w-48 h-48 bg-neutral-900 border border-neutral-800 rounded flex-shrink-0 overflow-hidden">
                {!artError ? (
                  <img
                    src={`/api/beets/albums/${album.id}/art${artTimestamp ? `?t=${artTimestamp}` : ''}`}
                    alt={album.album}
                    className="w-full h-full object-cover"
                    onError={() => setArtError(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <i className="fa-solid fa-compact-disc text-4xl text-neutral-700"></i>
                  </div>
                )}
              </div>

              <div className="flex-1">
                <h1 className="text-4xl font-light text-neutral-100 mb-2">{album.album}</h1>
                <p className="text-xl text-neutral-400 mb-4">{album.albumartist}</p>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  {album.year?.Valid && (
                    <div>
                      <span className="text-neutral-500">Year</span>
                      <p className="text-neutral-200">{album.year.Int64}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-neutral-500">Tracks</span>
                    <p className="text-neutral-200">{tracks.length}</p>
                  </div>
                  {album.label?.Valid && (
                    <div>
                      <span className="text-neutral-500">Label</span>
                      <p className="text-neutral-200">{album.label.String}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-neutral-500">Duration</span>
                    <p className="text-neutral-200">{formatDuration(totalDuration)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="border border-neutral-900 rounded overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-900/50 border-b border-neutral-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Artist</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-900">
                  {tracks.map((track) => (
                    <tr
                      key={track.id}
                      onClick={() => setPreviewTrack(track)}
                      className="hover:bg-neutral-900/30 cursor-pointer group"
                    >
                      <td className="px-4 py-3 text-sm text-neutral-500 font-mono">
                        {track.track?.Valid ? track.track.Int64 : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-200 group-hover:text-rose-400">
                        {track.title}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-400">{track.artist}</td>
                      <td className="px-4 py-3 text-sm text-neutral-500 font-mono">
                        {track.length ? formatDuration(track.length) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
