import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { formatDuration } from '../utils/formatters'
import { usePreview } from '../contexts/PreviewContext'
import { useAlbumArt } from '../hooks/useAlbumArt'
import { PreviewPanel } from '../components/tracks/PreviewPanel'
import { ResizablePreviewPanel } from '../components/common/ResizablePreviewPanel'
import { EditMetadataModal } from '../components/albums/EditMetadataModal'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { AlertDialog } from '../components/common/AlertDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'

export function AlbumDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { previewTrack, setPreviewTrack } = usePreview()
  const [album, setAlbum] = useState(null)
  const [tracks, setTracks] = useState([])
  const [mbTracklist, setMbTracklist] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [artTimestamp, setArtTimestamp] = useState(null)
  const [refetchingArt, setRefetchingArt] = useState(false)

  // Scroll position restoration - restore after album data loads
  useScrollRestoration({
    key: location.pathname,
    dataLoaded: !loading && !!album,
    enabled: true
  })

  // Use cached album art
  const { imageUrl: albumArtUrl, isLoading: artLoading, error: artError } = useAlbumArt(
    id ? parseInt(id) : null,
    800,
    artTimestamp
  )
  const [showEditModal, setShowEditModal] = useState(false)
  const [dominantColor, setDominantColor] = useState(null)
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false })
  const [alertDialog, setAlertDialog] = useState({ isOpen: false })

  useEffect(() => {
    loadAlbumData()
    loadMusicBrainzTracklist()
  }, [id])

  // Rebuild track list when MusicBrainz tracklist is loaded
  const [rawTracks, setRawTracks] = useState([])
  useEffect(() => {
    if (rawTracks.length > 0) {
      setTracks(buildCompleteTrackList(rawTracks, mbTracklist))
    }
  }, [mbTracklist, rawTracks])

  const loadAlbumData = () => {
    const albumId = parseInt(id)
    Promise.all([
      fetch(`/api/beets/albums/by-id/${albumId}`).then(res => res.json()),
      fetch(`/api/beets/items/by-album/${albumId}`).then(res => res.json())
    ])
      .then(([albumData, itemsData]) => {
        setAlbum(albumData)
        setRawTracks(itemsData)
        setTracks(buildCompleteTrackList(itemsData, mbTracklist))
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }

  const loadMusicBrainzTracklist = async () => {
    try {
      const res = await fetch(`/api/beets/mb-tracklist?album_id=${id}`)
      if (res.ok) {
        const data = await res.json()
        setMbTracklist(data.tracks || [])
      }
    } catch (err) {
      console.log('Could not load MusicBrainz tracklist:', err)
    }
  }

  // Build complete track list including missing tracks
  const buildCompleteTrackList = (tracks, mbTracks = []) => {
    if (!tracks || tracks.length === 0) return []

    // Get expected total from tracktotal field or max track number
    const trackTotal = tracks.find(t => t.tracktotal?.Valid)?.tracktotal?.Int64
    const maxTrackNum = Math.max(...tracks.filter(t => t.track?.Valid).map(t => t.track.Int64))
    const expectedTotal = trackTotal || maxTrackNum || mbTracks.length

    if (!expectedTotal) return tracks.map(t => ({ ...t, missing: false }))

    // Create a map of track numbers to tracks
    const trackMap = new Map()
    tracks.forEach(track => {
      if (track.track?.Valid) {
        trackMap.set(track.track.Int64, track)
      }
    })

    // Create a map of MusicBrainz tracks by position
    const mbTrackMap = new Map()
    mbTracks.forEach(track => {
      mbTrackMap.set(track.position, track)
    })

    // Build complete list with missing tracks
    const completeList = []
    for (let i = 1; i <= expectedTotal; i++) {
      if (trackMap.has(i)) {
        completeList.push({ ...trackMap.get(i), missing: false })
      } else {
        // Use MusicBrainz track name if available, otherwise generic message
        const mbTrack = mbTrackMap.get(i)
        completeList.push({
          missing: true,
          track: { Valid: true, Int64: i },
          title: mbTrack?.title || `Missing Track ${i}`,
          artist: '',
          length: mbTrack?.length ? mbTrack.length / 1000 : 0 // Convert ms to seconds
        })
      }
    }

    return completeList
  }

  const getDisplayTitle = (track) => {
    if (track.title?.match(/^#?\d+\s+Missing Track$/i)) {
      const filename = track.path.split('/').pop().replace(/\.[^.]+$/, '')
      return filename
    }
    return track.title
  }


  const handleRefetchArt = async () => {
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
      toast.success('Album art fetched successfully!')
    } catch (err) {
      toast.error('Error: ' + err.message)
    } finally {
      setRefetchingArt(false)
    }
  }

  const handleDeleteAlbum = () => {
    setDeleteDialog({
      isOpen: true,
      title: 'Delete Album',
      message: `Delete "${album.album}" by ${album.albumartist}?\n\nChoose how you want to delete this album:`,
      buttons: [
        {
          label: 'Cancel',
          variant: 'secondary',
          onClick: () => {}
        },
        {
          label: 'Library Only',
          variant: 'primary',
          onClick: () => performDeleteAlbum(false)
        },
        {
          label: 'Delete Files',
          variant: 'danger',
          onClick: () => performDeleteAlbum(true)
        }
      ]
    })
  }

  const performDeleteAlbum = async (deleteFiles) => {
    try {
      const response = await fetch('/api/beets/delete/album', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          album_id: parseInt(id),
          delete_files: deleteFiles
        })
      })

      if (!response.ok) throw new Error('Failed to delete album')

      toast.success('Album deleted successfully!')
      setTimeout(() => navigate('/'), 1500)
    } catch (err) {
      toast.error('Error: ' + err.message)
    }
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
      setTimeout(() => loadAlbumData(), 1000)
    } catch (err) {
      toast.error('Error: ' + err.message)
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
      className="transition-colors duration-700"
      style={{
        background: dominantColor
          ? `linear-gradient(to bottom, ${dominantColor} 0%, rgba(10, 10, 10, 0.95) 60%, rgb(10, 10, 10) 100%)`
          : 'rgb(10, 10, 10)'
      }}
    >
      <div className="mx-auto px-3 py-4 md:py-8 w-full max-w-[1800px] lg:max-w-[calc(min(1800px,100vw-512px))]">
        <div className="w-full">
          <div>
            <Button
              onClick={() => navigate('/')}
              variant="ghost"
              size="sm"
              className="mb-4 md:mb-6 text-muted-foreground hover:text-foreground"
            >
              <i className="fa-solid fa-arrow-left mr-2"></i>
              Back to Library
            </Button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8 mb-6 md:mb-8">
              {/* Album Art */}
              <div className="lg:col-span-1">
                <div className="aspect-square bg-neutral-900 border border-neutral-800 rounded overflow-hidden mb-2 flex items-center justify-center">
                  {artError || !albumArtUrl ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <i className="fa-solid fa-compact-disc text-4xl text-neutral-700"></i>
                    </div>
                  ) : (
                    <img
                      src={albumArtUrl}
                      alt={album.album}
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                      onLoad={(e) => {
                        const color = extractDominantColor(e.target)
                        if (color) setDominantColor(color)
                      }}
                    />
                  )}
                </div>
                <div className="flex gap-2">
                  <Tooltip>
                    <TooltipTrigger>
                      <Button
                        onClick={handleRefetchArt}
                        disabled={refetchingArt}
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-auto py-1.5"
                      >
                        {refetchingArt ? 'Refetching...' : 'Refetch Art'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Download album art from online sources</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger>
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-auto py-1.5"
                      >
                        <label className="cursor-pointer">
                          Upload Art
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) toast.info('Album art upload coming soon!')
                            }}
                          />
                        </label>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Upload custom album art</TooltipContent>
                  </Tooltip>
                </div>

                {/* External Links */}
                <div className="mt-4 pt-4 border-t border-neutral-800">
                  <p className="text-xs text-neutral-500 uppercase tracking-wider mb-3">Quick Links</p>
                  <div className="flex gap-2">
                    {album.mb_albumid?.Valid && album.mb_albumid?.String && (
                      <a
                        href={`https://musicbrainz.org/release/${album.mb_albumid.String}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 px-3 py-2 text-xs bg-neutral-900/50 border border-neutral-800 rounded text-neutral-400 hover:bg-neutral-800 hover:border-neutral-700 transition-all flex flex-col items-center gap-1"
                        title="View on MusicBrainz"
                      >
                        <i className="fa-solid fa-database text-base"></i>
                        <span>MusicBrainz</span>
                      </a>
                    )}
                    <a
                      href={`https://www.last.fm/music/${encodeURIComponent(album.albumartist)}/${encodeURIComponent(album.album)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-3 py-2 text-xs bg-neutral-900/50 border border-neutral-800 rounded text-neutral-400 hover:bg-neutral-800 hover:border-neutral-700 transition-all flex flex-col items-center gap-1"
                      title="View on Last.fm"
                    >
                      <i className="fa-brands fa-lastfm text-base"></i>
                      <span>Last.fm</span>
                    </a>
                    <a
                      href={`https://open.spotify.com/search/${encodeURIComponent(album.albumartist + ' ' + album.album)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-3 py-2 text-xs bg-neutral-900/50 border border-neutral-800 rounded text-neutral-400 hover:bg-neutral-800 hover:border-neutral-700 transition-all flex flex-col items-center gap-1"
                      title="Search on Spotify"
                    >
                      <i className="fa-brands fa-spotify text-base"></i>
                      <span>Spotify</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Album Info */}
              <div className="lg:col-span-2">
                <h1 className="text-2xl md:text-3xl font-light text-neutral-100 mb-1 md:mb-2">{album.album}</h1>
                <p className="text-lg md:text-xl text-neutral-400 mb-3 md:mb-4">{album.albumartist}</p>

                {/* Metadata Tools */}
                <div className="flex flex-col sm:flex-row gap-2 mb-4 md:mb-6">
                  <Tooltip>
                    <TooltipTrigger>
                      <Button
                        onClick={() => setShowEditModal(true)}
                        variant="outline"
                        size="sm"
                      >
                        Edit Metadata
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit album information and tags</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger>
                      <Button
                        onClick={handleDeleteAlbum}
                        variant="outline"
                        size="sm"
                        className="hover:border-red-500 hover:text-red-500"
                      >
                        Delete Album
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove album from library</TooltipContent>
                  </Tooltip>
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-4 text-sm mb-4 md:mb-6">
                  {/* Date */}
                  {(album.year?.Valid || album.month?.Valid || album.day?.Valid) && (
                    <div>
                      <span className="text-neutral-500">Date</span>
                      <p className="text-neutral-200">
                        {album.year?.Valid && album.year.Int64}
                        {album.month?.Valid && album.month.Int64 && `-${String(album.month.Int64).padStart(2, '0')}`}
                        {album.day?.Valid && album.day.Int64 && `-${String(album.day.Int64).padStart(2, '0')}`}
                      </p>
                    </div>
                  )}
                  {album.label?.Valid && album.label.String && (
                    <div>
                      <span className="text-neutral-500">Label</span>
                      <p className="text-neutral-200">{album.label.String}</p>
                    </div>
                  )}
                  {album.country?.Valid && album.country.String && (
                    <div>
                      <span className="text-neutral-500">Country</span>
                      <p className="text-neutral-200">{album.country.String}</p>
                    </div>
                  )}
                  {album.catalognum?.Valid && album.catalognum.String && (
                    <div>
                      <span className="text-neutral-500">Catalog #</span>
                      <p className="text-neutral-200 font-mono text-xs">{album.catalognum.String}</p>
                    </div>
                  )}
                  {album.barcode?.Valid && album.barcode.String && (
                    <div>
                      <span className="text-neutral-500">Barcode</span>
                      <p className="text-neutral-200 font-mono text-xs">{album.barcode.String}</p>
                    </div>
                  )}
                  {album.albumtype?.Valid && album.albumtype.String && (
                    <div>
                      <span className="text-neutral-500">Type</span>
                      <p className="text-neutral-200">{album.albumtype.String}</p>
                    </div>
                  )}
                  {album.albumstatus?.Valid && album.albumstatus.String && (
                    <div>
                      <span className="text-neutral-500">Status</span>
                      <p className="text-neutral-200">{album.albumstatus.String}</p>
                    </div>
                  )}
                  {album.comp?.Valid && album.comp.Int64 === 1 && (
                    <div>
                      <span className="text-neutral-500">Compilation</span>
                      <p className="text-neutral-200">Yes</p>
                    </div>
                  )}
                  {album.disctotal?.Valid && album.disctotal.Int64 > 1 && (
                    <div>
                      <span className="text-neutral-500">Discs</span>
                      <p className="text-neutral-200">{album.disctotal.Int64}</p>
                    </div>
                  )}
                  {album.genres?.Valid && album.genres.String && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span className="text-neutral-500 block mb-1">Genres</span>
                      <div className="flex flex-wrap gap-1">
                        {album.genres.String.split(String.fromCharCode(0)).filter(g => g.trim()).map((genre, i) => (
                          <Badge key={i} variant="secondary">
                            {genre}
                          </Badge>
                        ))}
                      </div>
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
              <h2 className="text-sm font-medium text-neutral-500 mb-3 md:mb-4 uppercase tracking-wider">
                Tracks
              </h2>
              <div className="border border-neutral-800 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-neutral-800 hover:bg-transparent">
                      <TableHead className="w-10 text-neutral-500">#</TableHead>
                      <TableHead className="text-neutral-500">Title</TableHead>
                      <TableHead className="hidden sm:table-cell text-neutral-500">Artist</TableHead>
                      <TableHead className="text-right text-neutral-500">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tracks.map((track) => (
                      <TableRow
                        key={track.id || `missing-${track.track.Int64}`}
                        onClick={() => !track.missing && setPreviewTrack(track)}
                        className={`border-b border-neutral-800 ${track.missing ? 'opacity-40' : 'cursor-pointer group hover:bg-neutral-900/50'}`}
                      >
                        <TableCell className="font-mono">
                          <span className={`${previewTrack?.id === track.id && !track.missing ? 'text-rose-500' : 'text-neutral-500'}`}>
                            {track.track?.Valid ? track.track.Int64 : '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={track.missing ? 'text-neutral-500 italic' : 'text-neutral-100 group-hover:text-rose-400 transition-colors'}>
                            {getDisplayTitle(track)}
                          </span>
                        </TableCell>
                        <TableCell className="text-neutral-400 hidden sm:table-cell">{track.artist}</TableCell>
                        <TableCell className="text-neutral-400 font-mono text-right">
                          {track.length ? formatDuration(track.length) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Modals */}
            <EditMetadataModal
              album={album}
              isOpen={showEditModal}
              onClose={() => setShowEditModal(false)}
              onSave={loadAlbumData}
            />

            <ConfirmDialog
              isOpen={deleteDialog.isOpen}
              onClose={() => setDeleteDialog({ isOpen: false })}
              title={deleteDialog.title}
              message={deleteDialog.message}
              buttons={deleteDialog.buttons || []}
            />

            <AlertDialog
              isOpen={alertDialog.isOpen}
              onClose={() => setAlertDialog({ isOpen: false })}
              title={alertDialog.title}
              message={alertDialog.message}
              variant={alertDialog.variant}
            />
          </div>

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
            className={`fixed bottom-0 left-0 right-0 h-[85vh] rounded-t-xl border-t border-neutral-800 bg-neutral-900 backdrop-blur-sm z-40 overflow-hidden transition-transform duration-300 ${previewTrack ? 'translate-y-0' : 'translate-y-full'} lg:top-16 lg:bottom-0 lg:right-0 lg:left-auto lg:h-auto lg:rounded-none lg:border-l lg:border-t-0 ${previewTrack ? 'lg:translate-y-0 lg:translate-x-0' : 'lg:translate-y-0 lg:translate-x-full'}`}
          >
            {previewTrack && (
              <PreviewPanel
                key={previewTrack.id}
                track={previewTrack}
                onClose={() => setPreviewTrack(null)}
                setPreviewTrack={setPreviewTrack}
                onDeleteTrack={handleDeleteTrack}
              />
            )}
          </ResizablePreviewPanel>
        </div>
      </div>
    </div>
  )
}
