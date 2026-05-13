import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams, Link, useLocation } from 'react-router-dom'
import './App.css'

// Preview panel context
const PreviewContext = createContext(null)
const ConfigErrorContext = createContext(null)

function ConfigErrorToast() {
  const { configError } = useContext(ConfigErrorContext)
  if (!configError) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-in">
      <div className="bg-rose-950 border border-rose-900 rounded-lg p-4 shadow-2xl max-w-md backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="text-rose-500 mt-0.5">
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-rose-200 mb-1">Configuration Error</h3>
            <p className="text-xs text-rose-300/80 leading-relaxed mb-3 line-clamp-2">
              {configError.error}
            </p>
            <div className="flex gap-2">
              <Link 
                to="/tools" 
                className="text-[10px] font-bold uppercase tracking-wider text-rose-200 hover:text-white bg-rose-900/50 px-2 py-1 rounded"
              >
                View Details
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewPanel({ track, onClose, setPreviewTrack }) {
  const audioRef = useRef(null)
  const panelRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [fetchingLyrics, setFetchingLyrics] = useState(false)
  const [lyricsError, setLyricsError] = useState(null)
  const [lyricsSuccess, setLyricsSuccess] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    artist: '',
    album: '',
    track: '',
    genre: ''
  })

  useEffect(() => {
    if (track) {
      setFormData({
        title: track.title || '',
        artist: track.artist || '',
        album: track.album || '',
        track: track.track?.Valid ? track.track.Int64.toString() : '',
        genre: track.genres?.Valid ? track.genres.String : ''
      })
    }
  }, [track])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  const handlePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      } else {
        audioRef.current.currentTime = 0
        audioRef.current.play()
        setIsPlaying(true)

        // Stop after 30 seconds
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.pause()
            setIsPlaying(false)
          }
        }, 30000)
      }
    }
  }

  const handleSave = async () => {
    const updates = {}
    if (formData.title !== track.title) updates.title = formData.title
    if (formData.artist !== track.artist) updates.artist = formData.artist
    if (formData.album !== track.album) updates.album = formData.album
    if (formData.track) updates.track = formData.track
    if (formData.genre) updates.genre = formData.genre

    if (Object.keys(updates).length === 0) {
      setEditMode(false)
      return
    }

    try {
      const response = await fetch('/api/beets/modify-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: track.id, updates })
      })

      if (!response.ok) throw new Error('Failed to update track')

      setEditMode(false)
      onClose()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  if (!track) return null

  const handleFetchLyrics = async () => {
    setFetchingLyrics(true)
    setLyricsError(null)
    setLyricsSuccess(false)

    try {
      // Call the fetch lyrics endpoint
      const response = await fetch('/api/beets/fetch-lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: track.id })
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        const errorMsg = error.error || 'Failed to fetch lyrics from server'

        // Provide more helpful error messages
        if (response.status === 404) {
          throw new Error('Lyrics service not found. Make sure the lyrics plugin is enabled in beets config.')
        } else if (response.status >= 500) {
          throw new Error('Server error while fetching lyrics. Please try again.')
        } else {
          throw new Error(errorMsg)
        }
      }

      // Wait for beets to write to database
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Refetch the track to get updated lyrics
      const itemResponse = await fetch(`/api/beets/items`)

      if (!itemResponse.ok) {
        throw new Error('Failed to reload track data')
      }

      const items = await itemResponse.json()
      const updatedTrack = items.find(item => item.id === track.id)

      if (!updatedTrack) {
        throw new Error('Track not found after fetching lyrics')
      }

      if (updatedTrack.lyrics && updatedTrack.lyrics.trim().length > 0) {
        // Successfully found lyrics
        setPreviewTrack(updatedTrack)
        setLyricsSuccess(true)
        setTimeout(() => setLyricsSuccess(false), 3000)
      } else {
        // Beets command succeeded but no lyrics were found online
        setLyricsError('No lyrics found online for this track. The song may not be in lyrics databases, or the metadata may not match.')
      }
    } catch (err) {
      // Network or other errors
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setLyricsError('Network error. Please check your connection and try again.')
      } else {
        setLyricsError(err.message)
      }
    } finally {
      setFetchingLyrics(false)
    }
  }

  return (
    <div ref={panelRef} className="w-full h-full">
      <audio ref={audioRef} src={`/api/beets/items/${track.id}/stream`} />

      <div className="p-8 space-y-8 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-800/50 text-neutral-500 hover:text-neutral-300 transition-colors z-10"
        >
          <i className="fa-solid fa-xmark text-sm"></i>
        </button>

        {/* Metadata */}
        {!editMode ? (
          <div className="space-y-6">
            <div className="flex items-start justify-between pr-12">
              <div>
                <h2 className="text-3xl font-light text-neutral-100 mb-2">{track.title}</h2>
                <p className="text-lg text-neutral-400">{track.artist}</p>
              </div>
              <button
                onClick={() => setEditMode(true)}
                className="px-3 py-1.5 text-xs bg-neutral-800 border border-neutral-700 rounded text-neutral-400 hover:border-rose-500 hover:text-rose-500 transition-colors"
              >
                <i className="fa-solid fa-pen mr-1"></i>
                Edit
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div>
                <span className="text-neutral-500 text-xs uppercase tracking-wider">Album</span>
                <p className="text-neutral-200 mt-1">{track.album}</p>
              </div>
              {track.track?.Valid && (
                <div>
                  <span className="text-neutral-500 text-xs uppercase tracking-wider">Track</span>
                  <p className="text-neutral-200 mt-1">#{track.track.Int64}</p>
                </div>
              )}
              {track.genres?.Valid && (
                <div>
                  <span className="text-neutral-500 text-xs uppercase tracking-wider">Genre</span>
                  <p className="text-neutral-200 mt-1">{track.genres.String.split('\0').filter(g => g.trim()).join(', ')}</p>
                </div>
              )}
              {track.year?.Valid && (
                <div>
                  <span className="text-neutral-500 text-xs uppercase tracking-wider">Year</span>
                  <p className="text-neutral-200 mt-1">{track.year.Int64}</p>
                </div>
              )}
              <div>
                <span className="text-neutral-500 text-xs uppercase tracking-wider">Format</span>
                <p className="text-neutral-200 mt-1 font-mono text-xs">{track.format?.toUpperCase()} • {Math.round(track.bitrate / 1000)} kbps</p>
              </div>
              <div>
                <span className="text-neutral-500 text-xs uppercase tracking-wider">Duration</span>
                <p className="text-neutral-200 mt-1">{track.length ? `${Math.floor(track.length / 60)}:${Math.floor(track.length % 60).toString().padStart(2, '0')}` : '-'}</p>
              </div>
            </div>

            {/* Play button */}
            <button
              onClick={handlePlay}
              className="w-full py-3 bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 hover:border-rose-500 rounded-lg flex items-center justify-center gap-3 text-neutral-300 hover:text-rose-400 font-medium transition-all"
            >
              <i className={`fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'} text-sm`}></i>
              {isPlaying ? 'Playing...' : 'Preview (30s)'}
            </button>

            {/* Lyrics section */}
            <div className="pt-6 border-t border-neutral-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Lyrics</h3>
                {!track.lyrics && (
                  <button
                    onClick={handleFetchLyrics}
                    disabled={fetchingLyrics}
                    className="px-3 py-1.5 text-xs bg-neutral-800 border border-neutral-700 rounded text-neutral-400 hover:border-rose-500 hover:text-rose-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {fetchingLyrics && (
                      <div className="w-3 h-3 border-2 border-neutral-600 border-t-rose-500 rounded-full animate-spin"></div>
                    )}
                    {fetchingLyrics ? 'Searching online...' : 'Fetch Lyrics'}
                  </button>
                )}
              </div>

              {/* Success message */}
              {lyricsSuccess && (
                <div className="mb-4 p-3 bg-rose-950/30 border border-rose-900/50 rounded text-sm text-rose-400 flex items-center gap-2">
                  <i className="fa-solid fa-check-circle"></i>
                  Lyrics found and saved!
                </div>
              )}

              {/* Error message */}
              {lyricsError && (
                <div className="mb-4 p-3 bg-red-950/30 border border-red-900/50 rounded text-sm">
                  <div className="flex items-start gap-2">
                    <i className="fa-solid fa-exclamation-triangle text-red-500 mt-0.5"></i>
                    <div className="flex-1">
                      <p className="text-red-400 font-medium mb-1">Failed to fetch lyrics</p>
                      <p className="text-red-300/80 text-xs">{lyricsError}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Fetching state */}
              {fetchingLyrics && (
                <div className="mb-4 p-3 bg-neutral-800/50 border border-neutral-700 rounded text-sm text-neutral-400 flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-neutral-600 border-t-rose-500 rounded-full animate-spin"></div>
                  <div>
                    <p className="font-medium">Searching for lyrics...</p>
                    <p className="text-xs text-neutral-500 mt-0.5">This may take a few moments</p>
                  </div>
                </div>
              )}

              <div className="text-sm text-neutral-400 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
                {track.lyrics ? (
                  track.lyrics
                ) : (
                  <div className="text-center py-8">
                    <i className="fa-solid fa-music text-3xl text-neutral-700 mb-3"></i>
                    <p className="text-neutral-500 mb-2">No lyrics available</p>
                    <p className="text-xs text-neutral-600">Click "Fetch Lyrics" to search online lyrics databases</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-neutral-200">Edit Track</h3>

            <div>
              <label className="block text-xs text-neutral-500 mb-1">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-500 mb-1">Artist</label>
              <input
                type="text"
                value={formData.artist}
                onChange={(e) => setFormData({ ...formData, artist: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-500 mb-1">Album</label>
              <input
                type="text"
                value={formData.album}
                onChange={(e) => setFormData({ ...formData, album: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Track #</label>
                <input
                  type="text"
                  value={formData.track}
                  onChange={(e) => setFormData({ ...formData, track: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Genre</label>
                <input
                  type="text"
                  value={formData.genre}
                  onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 bg-rose-500 text-white rounded hover:bg-rose-600 text-sm font-medium"
              >
                Save
              </button>
              <button
                onClick={() => setEditMode(false)}
                className="flex-1 px-4 py-2 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* File info */}
        <div className="pt-4 border-t border-neutral-800">
          <p className="text-xs text-neutral-600 font-mono break-all">{track.path}</p>
        </div>
      </div>
    </div>
  )
}

function PreviewProvider({ children }) {
  const [previewTrack, setPreviewTrack] = useState(null)
  const location = useLocation()

  // Close preview panel when navigating away from track views
  useEffect(() => {
    if (location.pathname.startsWith('/tools')) {
      setPreviewTrack(null)
    }
  }, [location.pathname])

  return (
    <PreviewContext.Provider value={{ previewTrack, setPreviewTrack }}>
      {children}
    </PreviewContext.Provider>
  )
}

function AlbumDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { previewTrack, setPreviewTrack } = useContext(PreviewContext)
  const [album, setAlbum] = useState(null)
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [refetching, setRefetching] = useState(false)
  const [refetchingArt, setRefetchingArt] = useState(false)
  const [showDiffModal, setShowDiffModal] = useState(false)
  const [metadataDiff, setMetadataDiff] = useState(null)
  const [artTimestamp, setArtTimestamp] = useState('')
  const [artError, setArtError] = useState(false)
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

  const handleRefetchMetadata = async () => {
    if (!confirm('Refetch metadata from MusicBrainz? This will update all album information.')) return

    // Store current state
    const beforeAlbum = { ...album }
    const beforeTracks = [...tracks]

    setRefetching(true)
    try {
      const response = await fetch('/api/beets/refetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: parseInt(id) })
      })

      if (!response.ok) throw new Error('Failed to refetch metadata')

      // Reload data
      const albumId = parseInt(id)
      const [afterAlbum, afterTracks] = await Promise.all([
        fetch(`/api/beets/albums/by-id/${albumId}`).then(res => res.json()),
        fetch(`/api/beets/items/by-album/${albumId}`).then(res => res.json())
      ])

      if (!afterAlbum) {
        throw new Error('Album not found after refetch. It may have been removed or merged.')
      }

      // Calculate diff
      const diff = calculateMetadataDiff(beforeAlbum, afterAlbum, beforeTracks, afterTracks)

      setAlbum(afterAlbum)
      setTracks(afterTracks)
      setMetadataDiff(diff)
      setShowDiffModal(true)
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setRefetching(false)
    }
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

      // Reset error state and update timestamp to force image reload
      setArtError(false)
      setArtTimestamp(Date.now())
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setRefetchingArt(false)
    }
  }

  const calculateMetadataDiff = (before, after, beforeTracks, afterTracks) => {
    const changes = []

    // Album fields to compare
    const fields = [
      { key: 'album', label: 'Album' },
      { key: 'albumartist', label: 'Artist' },
      { key: 'year', label: 'Year', getValue: (v) => v?.Valid ? v.Int64 : null },
      { key: 'label', label: 'Label', getValue: (v) => v?.Valid ? v.String : null },
      { key: 'genres', label: 'Genre', getValue: (v) => v?.Valid ? v.String : null },
      { key: 'country', label: 'Country', getValue: (v) => v?.Valid ? v.String : null },
    ]

    fields.forEach(({ key, label, getValue }) => {
      const beforeVal = getValue ? getValue(before[key]) : before[key]
      const afterVal = getValue ? getValue(after[key]) : after[key]

      if (beforeVal !== afterVal) {
        changes.push({
          field: label,
          before: beforeVal || '(empty)',
          after: afterVal || '(empty)'
        })
      }
    })

    // Track count changes
    if (beforeTracks.length !== afterTracks.length) {
      changes.push({
        field: 'Track Count',
        before: beforeTracks.length,
        after: afterTracks.length
      })
    }

    return changes
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-rose-500 border-r-transparent"></div>
          <p className="mt-4 text-neutral-500 text-sm">Loading album...</p>
        </div>
      </div>
    )
  }

  if (error || !album) {
    return (
      <div className="min-h-screen bg-neutral-950">
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <button onClick={() => navigate(-1)} className="text-sm text-neutral-400 hover:text-rose-500 mb-4">
            ← Back
          </button>
          <div className="border border-neutral-800 rounded p-6">
            <p className="text-neutral-400">{error || 'Album not found'}</p>
          </div>
        </div>
      </div>
    )
  }

  const formatDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  const formatGenres = (genresString) => {
    if (!genresString) return null
    // Split on null bytes and filter empty strings
    return genresString.split('\0').filter(g => g.trim()).join(', ')
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

  const totalDuration = tracks.reduce((sum, track) => sum + (track.length || 0), 0)

  // Build complete track list including missing tracks
  const buildCompleteTrackList = () => {
    if (tracks.length === 0) return []

    // Get track total from any track that has it, or use max track number
    const trackTotal = tracks.find(t => t.tracktotal?.Valid)?.tracktotal?.Int64
    const maxTrackNum = Math.max(...tracks.map(t => t.track?.Valid ? t.track.Int64 : 0))
    const expectedTotal = trackTotal || maxTrackNum

    if (!expectedTotal) return tracks.map(t => ({ ...t, missing: false }))

    // Create map of existing tracks by track number
    const trackMap = new Map()
    tracks.forEach(track => {
      if (track.track?.Valid) {
        trackMap.set(track.track.Int64, track)
      }
    })

    // Build complete list with missing tracks
    const completeList = []
    for (let i = 1; i <= expectedTotal; i++) {
      if (trackMap.has(i)) {
        completeList.push({ ...trackMap.get(i), missing: false })
      } else {
        completeList.push({
          missing: true,
          track: { Valid: true, Int64: i },
          title: 'Missing Track',
          artist: album.albumartist,
          length: 0
        })
      }
    }

    return completeList
  }

  const completeTrackList = buildCompleteTrackList()

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
      <div className="flex">
        <div className="flex-1 min-w-0">
          <div className="max-w-7xl mx-auto px-6 py-8">
        <button onClick={() => navigate(-1)} className="text-sm text-neutral-400 hover:text-rose-500 mb-6">
          ← Back
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
                <svg className="w-16 h-16 text-neutral-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRefetchArt}
                disabled={refetchingArt}
                className="flex-1 px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-800 rounded text-neutral-400 hover:border-rose-500 hover:text-rose-500 disabled:opacity-50"
              >
                {refetchingArt ? 'Refetching...' : 'Refetch Art'}
              </button>
              <label className="flex-1 px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-800 rounded text-neutral-400 hover:border-rose-500 hover:text-rose-500 text-center cursor-pointer">
                Upload Art
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) alert('Album art upload coming soon!')
                }} />
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
                onClick={handleRefetchMetadata}
                disabled={refetching}
                className="px-3 py-1.5 text-sm bg-neutral-900 border border-neutral-800 rounded text-neutral-300 hover:border-rose-500 hover:text-rose-500 disabled:opacity-50"
              >
                {refetching ? 'Refetching...' : 'Refetch Metadata'}
              </button>
              <button
                onClick={() => setShowEditModal(true)}
                className="px-3 py-1.5 text-sm bg-neutral-900 border border-neutral-800 rounded text-neutral-300 hover:border-rose-500 hover:text-rose-500"
              >
                Edit Metadata
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm mb-6">
              {album.year && album.year.Valid && (
                <div>
                  <span className="text-neutral-500">Year</span>
                  <p className="text-neutral-200">{album.year.Int64}</p>
                </div>
              )}
              {album.label && album.label.Valid && (
                <div>
                  <span className="text-neutral-500">Label</span>
                  <p className="text-neutral-200">{album.label.String}</p>
                </div>
              )}
              {album.genres && album.genres.Valid && (
                <div>
                  <span className="text-neutral-500">Genre</span>
                  <p className="text-neutral-200">{formatGenres(album.genres.String)}</p>
                </div>
              )}
              {album.country && album.country.Valid && (
                <div>
                  <span className="text-neutral-500">Country</span>
                  <p className="text-neutral-200">{album.country.String}</p>
                </div>
              )}
              <div>
                <span className="text-neutral-500">Tracks</span>
                <p className="text-neutral-200">
                  {tracks.length}
                  {completeTrackList.length > tracks.length && (
                    <span className="text-neutral-500"> of {completeTrackList.length}</span>
                  )}
                </p>
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
            {completeTrackList.length > tracks.length && (
              <span className="text-neutral-600 ml-2 normal-case font-normal">
                ({tracks.length} of {completeTrackList.length})
              </span>
            )}
          </h2>
          <div className="border border-neutral-900 rounded overflow-hidden">
            <table className="w-full">
              <thead className="bg-neutral-900/50 border-b border-neutral-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider w-12">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Artist</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {completeTrackList.map((track, index) => (
                  <tr
                    key={track.id || `missing-${track.track.Int64}`}
                    onClick={() => !track.missing && setPreviewTrack(track)}
                    className={track.missing ? 'opacity-40' : 'hover:bg-neutral-900/30 cursor-pointer group'}
                  >
                    <td className="px-4 py-3 text-sm font-mono relative">
                      {!track.missing && (
                        <i className="fa-solid fa-play text-xs opacity-0 group-hover:opacity-100 transition-opacity absolute left-4 text-rose-500"></i>
                      )}
                      <span className={`transition-opacity ${!track.missing ? 'group-hover:opacity-0' : ''} ${previewTrack?.id === track.id && !track.missing ? 'text-rose-500' : 'text-neutral-500'}`}>
                        {track.track && track.track.Valid ? track.track.Int64 : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={track.missing ? 'text-neutral-600 italic' : 'text-neutral-200 group-hover:text-rose-400 transition-colors'}>
                        {track.title}
                      </span>
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

        <EditMetadataModal
          album={album}
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSave={() => {
            loadAlbumData()
          }}
        />

        <MetadataDiffModal
          diff={metadataDiff}
          isOpen={showDiffModal}
          onClose={() => setShowDiffModal(false)}
        />
          </div>
        </div>

        {previewTrack && (
          <div className="w-1/2 flex-shrink-0 border-l border-neutral-800 sticky top-16 h-[calc(100vh-4rem)] self-start overflow-y-auto">
            <PreviewPanel
              track={previewTrack}
              onClose={() => setPreviewTrack(null)}
              setPreviewTrack={setPreviewTrack}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function MetadataDiffModal({ diff, isOpen, onClose }) {
  if (!isOpen || !diff) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-medium text-neutral-200 mb-4">Metadata Changes</h2>

        {diff.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-neutral-400">No changes detected</p>
            <p className="text-sm text-neutral-500 mt-2">The metadata is already up to date</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-neutral-400 mb-4">
              {diff.length} field{diff.length > 1 ? 's' : ''} updated:
            </p>

            {diff.map((change, index) => (
              <div key={index} className="border border-neutral-800 rounded p-4">
                <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
                  {change.field}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-neutral-500 mb-1">Before</div>
                    <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded px-3 py-2">
                      {change.before}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500 mb-1">After</div>
                    <div className="text-sm text-rose-400 bg-rose-950/30 border border-rose-900/50 rounded px-3 py-2">
                      {change.after}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-6 px-4 py-2 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 text-sm font-medium"
        >
          Close
        </button>
      </div>
    </div>
  )
}

function EditMetadataModal({ album, isOpen, onClose, onSave }) {
  const [formData, setFormData] = useState({
    album: '',
    albumartist: '',
    year: '',
    label: '',
    genre: '',
  })

  useEffect(() => {
    if (album && isOpen) {
      // Format genres from null-byte separated to comma-separated for editing
      const genreString = album.genres?.Valid ? album.genres.String : ''
      const formattedGenres = genreString ? genreString.split('\0').filter(g => g.trim()).join(', ') : ''

      setFormData({
        album: album.album || '',
        albumartist: album.albumartist || '',
        year: album.year?.Valid ? album.year.Int64.toString() : '',
        label: album.label?.Valid ? album.label.String : '',
        genre: formattedGenres,
      })
    }
  }, [album, isOpen])

  const handleSubmit = async (e) => {
    e.preventDefault()

    const updates = {}
    if (formData.album !== album.album) updates.album = formData.album
    if (formData.albumartist !== album.albumartist) updates.albumartist = formData.albumartist
    if (formData.year) updates.year = formData.year
    if (formData.label) updates.label = formData.label
    if (formData.genre) updates.genre = formData.genre

    if (Object.keys(updates).length === 0) {
      alert('No changes made')
      return
    }

    try {
      const response = await fetch('/api/beets/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: album.id, updates })
      })

      if (!response.ok) throw new Error('Failed to update metadata')

      onSave()
      onClose()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-medium text-neutral-200 mb-4">Edit Metadata</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Album</label>
            <input
              type="text"
              value={formData.album}
              onChange={(e) => setFormData({ ...formData, album: e.target.value })}
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">Artist</label>
            <input
              type="text"
              value={formData.albumartist}
              onChange={(e) => setFormData({ ...formData, albumartist: e.target.value })}
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-neutral-400 mb-1">Year</label>
              <input
                type="text"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-1">Genre</label>
              <input
                type="text"
                value={formData.genre}
                onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">Label</label>
            <input
              type="text"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-rose-500 text-white rounded hover:bg-rose-600 text-sm font-medium"
            >
              Save Changes
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ToolsGallery() {
  const navigate = useNavigate()
  const { setConfigError } = useContext(ConfigErrorContext)
  const [config, setConfig] = useState(null)
  const [rawConfig, setRawConfig] = useState(null)
  const [localError, setLocalError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/beets/config')
      .then(res => {
        if (!res.ok) throw new Error(`Config: ${res.status} ${res.statusText}`)
        return res.json()
      })
      .then(data => {
        if (data.is_valid === false) {
          setConfigError({
            error: data.error,
            raw: data.raw_config
          })
          setLocalError(data.error)
          setRawConfig(data.raw_config)
        } else {
          setConfig(data.config)
          setConfigError(null)
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error('Config fetch failed:', err)
        setLoading(false)
      })
  }, [setConfigError])

  const highlightErrorLine = (raw, errorMsg) => {
    if (!raw) return null
    
    // Attempt to extract line number from yaml error message
    // Format usually: "line X, column Y"
    const match = errorMsg.match(/line (\d+)/)
    const errorLine = match ? parseInt(match[1]) : null
    
    return (
      <div className="bg-neutral-900 rounded p-4 font-mono text-xs overflow-x-auto whitespace-pre border border-neutral-800">
        {raw.split('\n').map((line, i) => {
          const isErrorLine = (i + 1) === errorLine
          return (
            <div 
              key={i} 
              className={`${isErrorLine ? 'bg-rose-950/50 text-rose-200 -mx-2 px-2 border-l-2 border-rose-500' : 'text-neutral-500'}`}
            >
              <span className="inline-block w-8 select-none text-neutral-700">{i + 1}</span>
              {line}
            </div>
          )
        })}
      </div>
    )
  }

  const tools = [
    {
      id: 'duplicates',
      name: 'Find Duplicates',
      description: 'Find and merge duplicate albums across different editions',
      icon: 'fa-solid fa-clone',
      plugin: 'duplicates',
      path: '/tools/duplicates'
    },
    {
      id: 'missing',
      name: 'Missing Tracks',
      description: 'List tracks that are missing from albums in your library',
      icon: 'fa-solid fa-list-ul',
      plugin: null, // built-in
      path: '/tools/missing'
    },
    {
      id: 'fetchart',
      name: 'Fetch Album Art',
      description: 'Batch fetch missing album artwork for your collection',
      icon: 'fa-solid fa-image',
      plugin: 'fetchart',
      path: '/tools/fetchart'
    },
    {
      id: 'lyrics',
      name: 'Fetch Lyrics',
      description: 'Download and embed lyrics for songs in your library',
      icon: 'fa-solid fa-file-lines',
      plugin: 'lyrics',
      path: '/tools/lyrics'
    },
    {
      id: 'convert',
      name: 'Convert Audio',
      description: 'Convert audio files to different formats',
      icon: 'fa-solid fa-right-left',
      plugin: 'convert',
      path: '/tools/convert'
    },
    {
      id: 'replaygain',
      name: 'ReplayGain',
      description: 'Calculate and apply ReplayGain tags for volume normalization',
      icon: 'fa-solid fa-volume-high',
      plugin: 'replaygain',
      path: '/tools/replaygain'
    }
  ]

  const isPluginAvailable = (pluginName) => {
    if (!pluginName) return true // built-in tools
    if (!config || !config.plugins) return false
    // Parse Go slice format: "[fetchart embedart musicbrainz bucket]"
    const pluginsStr = config.plugins.replace(/[\[\]]/g, '').trim()
    const plugins = pluginsStr.split(/\s+/).filter(p => p)
    return plugins.includes(pluginName)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950">
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-rose-500 border-r-transparent"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-light text-neutral-200 mb-2">Tools</h1>
          <p className="text-sm text-neutral-400">
            Manage and organize your music library with these beets-powered tools
          </p>
        </div>

        {localError && (
          <div className="mb-10 bg-rose-950/20 border border-rose-900/50 rounded-lg p-6 animate-slide-in">
            <div className="flex items-center gap-3 mb-4 text-rose-500">
              <i className="fa-solid fa-triangle-exclamation text-xl"></i>
              <h2 className="text-lg font-medium text-rose-200">Configuration Error Detected</h2>
            </div>
            <p className="text-neutral-400 text-sm mb-6 leading-relaxed">
              Your <code className="text-rose-400 bg-rose-950/40 px-1.5 py-0.5 rounded">config.yaml</code> has a syntax error that prevents Beets from starting correctly. 
              Some management tools may be unavailable until this is fixed.
            </p>
            <div className="bg-black/40 rounded-lg p-4 mb-4">
              <p className="text-rose-400 font-mono text-xs mb-3">{localError}</p>
              {highlightErrorLine(rawConfig, localError)}
            </div>
            <p className="text-neutral-500 text-xs italic">
              Tip: Check for inconsistent indentation or missing colons in your config file.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool) => {
            const available = isPluginAvailable(tool.plugin)
            return (
              <button
                key={tool.id}
                onClick={() => available && navigate(tool.path)}
                disabled={!available}
                className={`text-left p-6 border rounded-lg transition-all ${
                  available
                    ? 'bg-neutral-900 border-neutral-800 hover:border-rose-500 cursor-pointer'
                    : 'bg-neutral-900/50 border-neutral-900 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <i className={`${tool.icon} text-3xl ${available ? 'text-rose-500' : 'text-neutral-700'}`}></i>
                  {!available && (
                    <span className="px-2 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded text-neutral-500">
                      Plugin Required
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-medium text-neutral-200 mb-2">{tool.name}</h3>
                <p className="text-sm text-neutral-400 mb-3">{tool.description}</p>
                {tool.plugin && (
                  <div className="text-xs text-neutral-600">
                    Requires: <code className="text-neutral-500">{tool.plugin}</code> plugin
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function DuplicatesFinder() {
  const [duplicates, setDuplicates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pluginMissing, setPluginMissing] = useState(false)

  useEffect(() => {
    loadDuplicates()
  }, [])

  const loadDuplicates = async () => {
    setLoading(true)
    setPluginMissing(false)
    try {
      const response = await fetch('/api/beets/duplicates')
      const data = await response.json()

      // Check if the response is an error about missing plugin
      if (data.error && data.error.includes('unknown command')) {
        setPluginMissing(true)
        setDuplicates([])
      } else if (Array.isArray(data)) {
        setDuplicates(data)
      } else {
        setDuplicates([])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleMerge = async (query) => {
    if (!confirm(`Merge duplicates matching: ${query}?\n\nThis will combine the albums into one.`)) return

    try {
      const response = await fetch('/api/beets/duplicates/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      })

      if (!response.ok) throw new Error('Failed to merge duplicates')

      alert('Duplicates merged successfully!')
      loadDuplicates()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950">
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-rose-500 border-r-transparent"></div>
            <p className="mt-4 text-neutral-500 text-sm">Finding duplicates...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <button onClick={() => window.history.back()} className="text-sm text-neutral-400 hover:text-rose-500 mb-4">
            ← Back to Tools
          </button>
          <h1 className="text-2xl font-light text-neutral-200 mb-2">Find Duplicates</h1>
          <p className="text-sm text-neutral-400">
            Find and merge albums that have been split across multiple releases (e.g., standard, deluxe, anniversary editions).
          </p>
        </div>

        {pluginMissing && (
          <div className="border border-amber-900 bg-amber-950/30 rounded p-6 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-amber-400 font-medium mb-2">Duplicates Plugin Required</h3>
                <p className="text-sm text-neutral-300 mb-3">
                  The duplicates plugin is not enabled in your beets configuration. This feature requires the plugin to be activated.
                </p>
                <div className="bg-neutral-900 border border-neutral-800 rounded p-3 mb-3">
                  <p className="text-xs text-neutral-400 mb-2">Add to your beets config.yaml:</p>
                  <code className="text-xs text-rose-400">
                    plugins: [duplicates, fetchart, embedart, ...]
                  </code>
                </div>
                <p className="text-xs text-neutral-500">
                  After updating your config, restart the dev server to see changes.
                </p>
              </div>
            </div>
          </div>
        )}

        {error && !pluginMissing && (
          <div className="border border-red-900 bg-red-950/50 rounded p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {!pluginMissing && duplicates.length === 0 ? (
          <div className="border border-neutral-800 rounded p-8 text-center">
            <p className="text-neutral-400">No duplicate albums found.</p>
            <p className="text-sm text-neutral-500 mt-2">Your library is clean!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {duplicates.map((dup, index) => (
              <div key={index} className="border border-neutral-800 rounded p-4 flex items-center justify-between">
                <div>
                  <p className="text-neutral-200">{dup.info}</p>
                  <p className="text-xs text-neutral-500 mt-1">Potential duplicate detected</p>
                </div>
                <button
                  onClick={() => handleMerge(dup.info)}
                  className="px-4 py-2 bg-neutral-900 border border-neutral-800 rounded text-sm text-neutral-300 hover:border-rose-500 hover:text-rose-500"
                >
                  Merge
                </button>
              </div>
            ))}
          </div>
        )}

        {!pluginMissing && (
          <div className="mt-8 border border-neutral-800 rounded p-4 bg-neutral-900/50">
          <h3 className="text-sm font-medium text-neutral-300 mb-2">How it works</h3>
          <ul className="text-xs text-neutral-500 space-y-1">
            <li>• Finds albums with the same artist and similar album names</li>
            <li>• Useful for merging split albums (Standard, Deluxe, Anniversary editions)</li>
            <li>• Complete different versions won't be flagged as duplicates</li>
            <li>• Merging combines tracks and metadata from both albums</li>
          </ul>
        </div>
        )}
      </div>
    </div>
  )
}

function Dashboard() {
  const { previewTrack, setPreviewTrack } = useContext(PreviewContext)
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

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-rose-500 border-r-transparent"></div>
          <p className="mt-4 text-neutral-500 text-sm">Loading library...</p>
        </div>
      </div>
    )
  }

  if (error) {
    const isConnectionError = error.includes('Failed to fetch') || error.includes('ECONNREFUSED')
    const isServiceError = error.includes('503') || error.includes('502')

    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6">
        <div className="border border-red-900/50 bg-red-950/20 rounded-xl p-8 max-w-lg w-full backdrop-blur-sm shadow-2xl">
          <div className="flex items-center gap-4 mb-6 text-red-500">
            <div className="h-12 w-12 rounded-full bg-red-950/50 flex items-center justify-center border border-red-900/50">
              <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
            </div>
            <div>
              <h2 className="text-xl font-bold text-red-200">System Error</h2>
              <p className="text-red-400/60 text-sm">Communication with backend failed</p>
            </div>
          </div>

          <div className="bg-black/40 rounded-lg p-4 font-mono text-sm text-red-300 border border-red-900/30 mb-6 break-words">
            {error}
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">Troubleshooting</h3>
            <ul className="text-sm text-neutral-400 space-y-3">
              <li className="flex gap-3">
                <span className="text-rose-500 font-bold">1.</span>
                <span>Check if the backend is running by looking for <b>"🚀 Beetroot Backend Starting"</b> in your terminal logs.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-rose-500 font-bold">2.</span>
                <span>Verify your <b>beets configuration</b> is valid and the database path is correct.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-rose-500 font-bold">3.</span>
                <span>Ensure the backend is listening on <b>port 4433</b> (run <code>lsof -i :4433</code>).</span>
              </li>
            </ul>
          </div>

          <button 
            onClick={() => window.location.reload()}
            className="w-full mt-8 px-4 py-3 bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-lg hover:border-rose-500 hover:text-rose-500 transition-all font-medium"
          >
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
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

      <div className="flex">
        <div className="flex-1 min-w-0">
          <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Search Results Info */}
        {searchQuery && (
          <div className="mb-6 flex items-center justify-between">
            <p className="text-sm text-neutral-400">
              Search results for <span className="text-neutral-200 font-medium">"{searchQuery}"</span>
            </p>
            <button
              onClick={clearSearch}
              className="text-sm text-rose-500 hover:text-rose-400"
            >
              Clear search
            </button>
          </div>
        )}

        {/* Stats View */}
        {activeTab === 'stats' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider">Library Statistics</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Albums" value={stats?.total_albums || 0} />
                <StatCard title="Tracks" value={stats?.total_items || 0} />
                <StatCard title="Artists" value={stats?.total_artists || 0} />
                <StatCard
                  title="Total Duration"
                  value={stats?.total_duration_seconds ? formatDuration(stats.total_duration_seconds) : '0m'}
                />
              </div>
            </div>
          </div>
        )}

        {/* Albums View */}
        {activeTab === 'albums' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
                Albums (Showing {albums.length} of {albumsTotal})
              </h2>
              {albumsTotal > albumsPerPage && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAlbumsPage(Math.max(0, albumsPage - 1))}
                    disabled={albumsPage === 0}
                    className="px-3 py-1 text-xs bg-neutral-900 border border-neutral-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:border-rose-500 transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-neutral-500">
                    Page {albumsPage + 1} of {Math.ceil(albumsTotal / albumsPerPage)}
                  </span>
                  <button
                    onClick={() => setAlbumsPage(albumsPage + 1)}
                    disabled={(albumsPage + 1) * albumsPerPage >= albumsTotal}
                    className="px-3 py-1 text-xs bg-neutral-900 border border-neutral-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:border-rose-500 transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
            {albums.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-neutral-500">No albums found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {albums.map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tracks View */}
        {activeTab === 'tracks' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
                Tracks (Showing {items.length} of {itemsTotal})
              </h2>
              {itemsTotal > itemsPerPage && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setItemsPage(Math.max(0, itemsPage - 1))}
                    disabled={itemsPage === 0}
                    className="px-3 py-1 text-xs bg-neutral-900 border border-neutral-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:border-rose-500 transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-neutral-500">
                    Page {itemsPage + 1} of {Math.ceil(itemsTotal / itemsPerPage)}
                  </span>
                  <button
                    onClick={() => setItemsPage(itemsPage + 1)}
                    disabled={(itemsPage + 1) * itemsPerPage >= itemsTotal}
                    className="px-3 py-1 text-xs bg-neutral-900 border border-neutral-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:border-rose-500 transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
            {items.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-neutral-500">No tracks found</p>
              </div>
            ) : (
              <div className="border border-neutral-900 rounded overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-neutral-900/50 border-b border-neutral-900">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          #
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Title
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Artist
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Album
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Year
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Duration
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Format
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-900">
                      {items.map((item, index) => (
                        <tr
                          key={item.id}
                          onClick={() => setPreviewTrack(item)}
                          className="hover:bg-neutral-900/30 cursor-pointer group"
                        >
                          <td className="px-4 py-3 text-sm font-mono relative">
                            <i className="fa-solid fa-play text-xs opacity-0 group-hover:opacity-100 transition-opacity absolute left-4 text-rose-500"></i>
                            <span className={`group-hover:opacity-0 transition-opacity ${previewTrack?.id === item.id ? 'text-rose-500' : 'text-neutral-500'}`}>
                              {itemsPage * itemsPerPage + index + 1}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-neutral-200 group-hover:text-rose-400 transition-colors">{item.title}</td>
                          <td className="px-4 py-3 text-sm text-neutral-400">{item.artist}</td>
                          <td className="px-4 py-3 text-sm text-neutral-500">{item.album}</td>
                          <td className="px-4 py-3 text-sm text-neutral-500">
                            {item.year && item.year.Valid ? item.year.Int64 : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-neutral-500 font-mono">
                            {item.length ? formatDuration(item.length) : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className="text-neutral-500 font-mono text-xs">
                              {item.format?.toUpperCase() || 'N/A'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
          </div>
        </div>

        {previewTrack && (
          <div className="w-1/2 flex-shrink-0 border-l border-neutral-800 sticky top-16 h-[calc(100vh-4rem)] self-start overflow-y-auto bg-neutral-950">
            <PreviewPanel
              track={previewTrack}
              onClose={() => setPreviewTrack(null)}
              setPreviewTrack={setPreviewTrack}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function Header({ activeTab, setActiveTab, searchQuery, setSearchQuery, handleSearchSubmit, clearSearch, searching, showHelp, setShowHelp, handleSearch }) {
  const location = useLocation()
  const isToolsPage = location.pathname.startsWith('/tools')
  const isAlbumPage = location.pathname.startsWith('/album/')

  return (
    <header className="border-b border-neutral-800 bg-neutral-950 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2">
              <div className="text-2xl">🫜</div>
              <span className="text-lg font-semibold bg-clip-text bg-white text-transparent">Beetroot</span>
            </Link>

            <nav className="flex items-center gap-1">
              {activeTab !== undefined ? (
                <>
                  <button
                    onClick={() => setActiveTab('albums')}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      activeTab === 'albums'
                        ? 'bg-rose-500/10 text-rose-500'
                        : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                    }`}
                  >
                    Albums
                  </button>
                  <button
                    onClick={() => setActiveTab('tracks')}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      activeTab === 'tracks'
                        ? 'bg-rose-500/10 text-rose-500'
                        : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                    }`}
                  >
                    Tracks
                  </button>
                  <button
                    onClick={() => setActiveTab('stats')}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      activeTab === 'stats'
                        ? 'bg-rose-500/10 text-rose-500'
                        : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                    }`}
                  >
                    Stats
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/"
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      !isToolsPage && !isAlbumPage
                        ? 'bg-rose-500/10 text-rose-500'
                        : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                    }`}
                  >
                    Library
                  </Link>
                </>
              )}
              <Link
                to="/tools"
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  isToolsPage
                    ? 'bg-rose-500/10 text-rose-500'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                }`}
              >
                Tools
              </Link>
            </nav>
          </div>
        </div>

        {searchQuery !== undefined && (
          <>
            {/* Search Bar */}
            <div className="mt-4 flex gap-2">
              <form onSubmit={handleSearchSubmit} className="flex-1">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search: artist:name, year:2020..2024, genre:rock, ^exclude..."
                    className="w-full bg-neutral-900 border border-neutral-800 rounded px-4 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-rose-500"
                  />
                  {searchQuery && !searching && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  {searching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-rose-500 border-r-transparent"></div>
                    </div>
                  )}
                </div>
              </form>
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="px-3 py-2 bg-neutral-900 border border-neutral-800 rounded text-sm text-neutral-400 hover:text-neutral-300 hover:border-neutral-700"
                title="Query syntax help"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>

            {/* Search Help */}
            {showHelp && (
              <div className="mt-4 p-4 bg-neutral-900 border border-neutral-800 rounded text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-neutral-300 font-medium mb-2">Field Queries</h3>
                    <div className="space-y-1 text-neutral-500">
                      <div><code className="text-rose-500">artist:beatles</code> - search artist field</div>
                      <div><code className="text-rose-500">album:thriller</code> - search album field</div>
                      <div><code className="text-rose-500">genre:rock</code> - search genre field</div>
                      <div><code className="text-rose-500">title:love</code> - search title field</div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-neutral-300 font-medium mb-2">Range Queries</h3>
                    <div className="space-y-1 text-neutral-500">
                      <div><code className="text-rose-500">year:2020..2024</code> - year range</div>
                      <div><code className="text-rose-500">year:2020..</code> - from 2020 onwards</div>
                      <div><code className="text-rose-500">year:..2000</code> - up to 2000</div>
                      <div><code className="text-rose-500">bitrate:320000..</code> - minimum bitrate</div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-neutral-300 font-medium mb-2">Boolean Logic</h3>
                    <div className="space-y-1 text-neutral-500">
                      <div><code className="text-rose-500">foo bar</code> - AND (both required)</div>
                      <div><code className="text-rose-500">foo , bar</code> - OR (either one)</div>
                      <div><code className="text-rose-500">^exclude</code> - NOT (exclude term)</div>
                      <div><code className="text-rose-500">artist:air ^album:moon</code> - complex</div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-neutral-300 font-medium mb-2">Advanced</h3>
                    <div className="space-y-1 text-neutral-500">
                      <div><code className="text-rose-500">artist::the.*</code> - regex match</div>
                      <div><code className="text-rose-500">artist:=Beatles</code> - exact match</div>
                      <div><code className="text-rose-500">added:-1w..</code> - added last week</div>
                      <div><code className="text-rose-500">added:-1m..-1w</code> - date range</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Search Examples */}
            {!searchQuery && !showHelp && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span>Quick:</span>
                  <button
                    onClick={() => {
                      setSearchQuery('year:2020..2024')
                      handleSearch('year:2020..2024')
                    }}
                    className="px-2 py-1 bg-neutral-900 rounded hover:bg-neutral-800 hover:text-neutral-400 font-mono"
                  >
                    year:2020..2024
                  </button>
                  <button
                    onClick={() => {
                      setSearchQuery('artist:beatles')
                      handleSearch('artist:beatles')
                    }}
                    className="px-2 py-1 bg-neutral-900 rounded hover:bg-neutral-800 hover:text-neutral-400 font-mono"
                  >
                    artist:beatles
                  </button>
                  <button
                    onClick={() => {
                      setSearchQuery('genre:rock')
                      handleSearch('genre:rock')
                    }}
                    className="px-2 py-1 bg-neutral-900 rounded hover:bg-neutral-800 hover:text-neutral-400 font-mono"
                  >
                    genre:rock
                  </button>
                  <button
                    onClick={() => {
                      setSearchQuery('added:-1w..')
                      handleSearch('added:-1w..')
                    }}
                    className="px-2 py-1 bg-neutral-900 rounded hover:bg-neutral-800 hover:text-neutral-400 font-mono"
                  >
                    added:-1w..
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </header>
  )
}

function StatCard({ title, value }) {
  return (
    <div className="border border-neutral-900 rounded p-4">
      <div className="text-xs text-neutral-500 uppercase tracking-wider mb-2">{title}</div>
      <div className="text-2xl font-light text-neutral-200">{value}</div>
    </div>
  )
}

function AlbumCard({ album }) {
  const navigate = useNavigate()
  const [imageError, setImageError] = useState(false)

  return (
    <div className="group cursor-pointer" onClick={() => navigate(`/album/${album.id}`)}>
      <div className="aspect-square bg-neutral-900 border border-neutral-900 rounded mb-2 flex items-center justify-center overflow-hidden relative">
        {!imageError ? (
          <img
            src={`/api/beets/albums/${album.id}/art`}
            alt={album.album}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <svg className="w-12 h-12 text-neutral-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            />
          </svg>
        )}
      </div>
      <div>
        <div className="text-sm text-neutral-200 truncate group-hover:text-rose-500 transition-colors">
          {album.album}
        </div>
        <div className="text-xs text-neutral-500 truncate">{album.albumartist}</div>
        {album.year && album.year.Valid && (
          <div className="text-xs text-neutral-600 mt-1">{album.year.Int64}</div>
        )}
      </div>
    </div>
  )
}

function MissingTracksTool() {
  const navigate = useNavigate()
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAlbumsWithMissingTracks()
  }, [])

  const loadAlbumsWithMissingTracks = async () => {
    setLoading(true)
    try {
      const [albumsData, itemsData] = await Promise.all([
        fetch('/api/beets/albums').then(res => {
          if (!res.ok) throw new Error(`Albums: ${res.status} ${res.statusText}`)
          return res.json()
        }),
        fetch('/api/beets/items').then(res => {
          if (!res.ok) throw new Error(`Items: ${res.status} ${res.statusText}`)
          return res.json()
        })
      ])

      // Find albums with missing tracks
      const albumsWithMissing = []
      for (const album of albumsData) {
        const albumTracks = itemsData.filter(item =>
          item.album_id.Valid && item.album_id.Int64 === album.id
        )

        if (albumTracks.length === 0) continue

        // Get expected track total from any track
        const trackTotal = albumTracks.find(t => t.tracktotal?.Valid)?.tracktotal?.Int64
        const maxTrack = Math.max(...albumTracks.map(t => t.track?.Valid ? t.track.Int64 : 0))
        const expectedTotal = trackTotal || maxTrack

        if (expectedTotal && albumTracks.length < expectedTotal) {
          albumsWithMissing.push({
            ...album,
            currentTracks: albumTracks.length,
            expectedTracks: expectedTotal,
            missingCount: expectedTotal - albumTracks.length
          })
        }
      }

      setAlbums(albumsWithMissing)
    } catch (err) {
      console.error('Error loading albums:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950">
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-rose-500 border-r-transparent"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <button onClick={() => window.history.back()} className="text-sm text-neutral-400 hover:text-rose-500 mb-4">
            ← Back to Tools
          </button>
          <h1 className="text-2xl font-light text-neutral-200 mb-2">Missing Tracks</h1>
          <p className="text-sm text-neutral-400">
            {albums.length} album{albums.length !== 1 ? 's' : ''} with missing tracks
          </p>
        </div>

        {albums.length === 0 ? (
          <div className="border border-neutral-800 rounded p-8 text-center">
            <p className="text-neutral-400">No albums with missing tracks found!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {albums.map((album) => (
              <div
                key={album.id}
                onClick={() => navigate(`/album/${album.id}`)}
                className="border border-neutral-800 rounded p-4 flex items-center justify-between bg-neutral-900 hover:border-rose-500 cursor-pointer transition-colors"
              >
                <div>
                  <p className="text-neutral-200">{album.album}</p>
                  <p className="text-sm text-neutral-500">{album.albumartist}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-neutral-400">
                    {album.currentTracks} of {album.expectedTracks} tracks
                  </p>
                  <p className="text-xs text-red-400">
                    {album.missingCount} missing
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FetchArtTool() {
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState({})

  useEffect(() => {
    loadAlbums()
  }, [])

  const loadAlbums = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/beets/tools/missing-art')
      const data = await response.json()
      setAlbums(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Error loading albums:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFetchArt = async (albumId) => {
    setFetching(prev => ({ ...prev, [albumId]: true }))
    try {
      const response = await fetch('/api/beets/tools/fetch-art', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: albumId })
      })

      if (!response.ok) throw new Error('Failed to fetch artwork')

      // Remove from list after successful fetch
      setAlbums(prev => prev.filter(a => a.id !== albumId))
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setFetching(prev => ({ ...prev, [albumId]: false }))
    }
  }

  const handleFetchAll = async () => {
    if (!confirm(`Fetch artwork for all ${albums.length} albums? This may take a while.`)) return

    for (const album of albums) {
      await handleFetchArt(album.id)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950">
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-rose-500 border-r-transparent"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <button onClick={() => window.history.back()} className="text-sm text-neutral-400 hover:text-rose-500 mb-4">
            ← Back to Tools
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-light text-neutral-200 mb-2">Batch Fetch Album Art</h1>
              <p className="text-sm text-neutral-400">
                {albums.length} album{albums.length !== 1 ? 's' : ''} without artwork
              </p>
            </div>
            {albums.length > 0 && (
              <button
                onClick={handleFetchAll}
                className="px-4 py-2 bg-rose-500 text-white rounded hover:bg-rose-600 text-sm font-medium"
              >
                Fetch All Artwork
              </button>
            )}
          </div>
        </div>

        {albums.length === 0 ? (
          <div className="border border-neutral-800 rounded p-8 text-center">
            <p className="text-neutral-400">All albums have artwork!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {albums.map((album) => (
              <div key={album.id} className="border border-neutral-800 rounded p-4 flex items-center justify-between bg-neutral-900">
                <div>
                  <p className="text-neutral-200">{album.album}</p>
                  <p className="text-sm text-neutral-500">{album.albumartist}</p>
                </div>
                <button
                  onClick={() => handleFetchArt(album.id)}
                  disabled={fetching[album.id]}
                  className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-300 hover:border-rose-500 hover:text-rose-500 disabled:opacity-50"
                >
                  {fetching[album.id] ? 'Fetching...' : 'Fetch Art'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function LyricsTool() {
  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <button onClick={() => window.history.back()} className="text-sm text-neutral-400 hover:text-rose-500 mb-4">
            ← Back to Tools
          </button>
          <h1 className="text-2xl font-light text-neutral-200 mb-2">Fetch Lyrics</h1>
          <p className="text-sm text-neutral-400">
            Download and embed lyrics for your music
          </p>
        </div>
        <div className="border border-neutral-800 rounded p-8 text-center">
          <p className="text-neutral-500">Coming soon...</p>
        </div>
      </div>
    </div>
  )
}

function ConvertTool() {
  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <button onClick={() => window.history.back()} className="text-sm text-neutral-400 hover:text-rose-500 mb-4">
            ← Back to Tools
          </button>
          <h1 className="text-2xl font-light text-neutral-200 mb-2">Convert Audio</h1>
          <p className="text-sm text-neutral-400">
            Convert audio files to different formats
          </p>
        </div>
        <div className="border border-neutral-800 rounded p-8 text-center">
          <p className="text-neutral-500">Coming soon...</p>
        </div>
      </div>
    </div>
  )
}

function ReplayGainTool() {
  const [query, setQuery] = useState('')
  const [albumMode, setAlbumMode] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)

  const handleApply = async () => {
    if (!query.trim()) {
      alert('Please enter a query (or leave empty for entire library)')
      return
    }

    if (!confirm(`Apply ReplayGain in ${albumMode ? 'album' : 'track'} mode?\n\nQuery: ${query || '(entire library)'}`)) {
      return
    }

    setProcessing(true)
    setResult(null)

    try {
      const response = await fetch('/api/beets/tools/replaygain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query || '', album: albumMode })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to apply ReplayGain')
      }

      setResult({ success: true, message: 'ReplayGain applied successfully!' })
    } catch (err) {
      setResult({ success: false, message: err.message })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <button onClick={() => window.history.back()} className="text-sm text-neutral-400 hover:text-rose-500 mb-4">
            ← Back to Tools
          </button>
          <h1 className="text-2xl font-light text-neutral-200 mb-2">ReplayGain</h1>
          <p className="text-sm text-neutral-400">
            Calculate and apply ReplayGain tags for volume normalization
          </p>
        </div>

        <div className="border border-neutral-800 rounded p-6 bg-neutral-900 space-y-6">
          <div>
            <label className="block text-sm text-neutral-400 mb-2">Query (leave empty for entire library)</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., artist:beatles or albumartist:pink floyd"
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-4 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-rose-500"
            />
            <p className="text-xs text-neutral-600 mt-1">Uses beets query syntax</p>
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-2">Mode</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={albumMode}
                  onChange={() => setAlbumMode(true)}
                  className="text-rose-500"
                />
                <span className="text-sm text-neutral-300">Album mode (recommended)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!albumMode}
                  onChange={() => setAlbumMode(false)}
                  className="text-rose-500"
                />
                <span className="text-sm text-neutral-300">Track mode</span>
              </label>
            </div>
            <p className="text-xs text-neutral-600 mt-1">
              Album mode normalizes album tracks relative to each other
            </p>
          </div>

          {result && (
            <div className={`border rounded p-4 ${
              result.success
                ? 'border-rose-900 bg-rose-950/30'
                : 'border-red-900 bg-red-950/30'
            }`}>
              <p className={result.success ? 'text-rose-400' : 'text-red-400'}>
                {result.message}
              </p>
            </div>
          )}

          <button
            onClick={handleApply}
            disabled={processing}
            className="w-full px-4 py-3 bg-rose-500 text-white rounded hover:bg-rose-600 disabled:opacity-50 font-medium"
          >
            {processing ? 'Processing...' : 'Apply ReplayGain'}
          </button>
        </div>

        <div className="mt-6 border border-neutral-800 rounded p-4 bg-neutral-900/50">
          <h3 className="text-sm font-medium text-neutral-300 mb-2">About ReplayGain</h3>
          <ul className="text-xs text-neutral-500 space-y-1">
            <li>• Analyzes audio files and adds metadata for volume normalization</li>
            <li>• Album mode: normalizes tracks relative to album loudness</li>
            <li>• Track mode: normalizes each track independently</li>
            <li>• Safe: only adds tags, doesn't modify audio data</li>
            <li>• Supported by most modern music players</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function ConfigErrorProvider({ children }) {
  const [configError, setConfigError] = useState(null)
  return (
    <ConfigErrorContext.Provider value={{ configError, setConfigError }}>
      {children}
    </ConfigErrorContext.Provider>
  )
}

function App() {
  return (
    <Router>
      <ConfigErrorProvider>
        <PreviewProvider>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/album/:id" element={<AlbumDetail />} />
            <Route path="/tools" element={<ToolsGallery />} />
            <Route path="/tools/duplicates" element={<DuplicatesFinder />} />
            <Route path="/tools/missing" element={<MissingTracksTool />} />
            <Route path="/tools/fetchart" element={<FetchArtTool />} />
            <Route path="/tools/lyrics" element={<LyricsTool />} />
            <Route path="/tools/convert" element={<ConvertTool />} />
            <Route path="/tools/replaygain" element={<ReplayGainTool />} />
          </Routes>
          <ConfigErrorToast />
        </PreviewProvider>
      </ConfigErrorProvider>
    </Router>
  )
}

export default App
