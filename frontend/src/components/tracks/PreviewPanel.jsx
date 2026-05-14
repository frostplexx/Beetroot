import { useState, useEffect, useRef } from 'react'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { AlertDialog } from '../common/AlertDialog'

export function PreviewPanel({ track, onClose, setPreviewTrack }) {
  const audioRef = useRef(null)
  const panelRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [fetchingLyrics, setFetchingLyrics] = useState(false)
  const [lyricsError, setLyricsError] = useState(null)
  const [lyricsSuccess, setLyricsSuccess] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false })
  const [alertDialog, setAlertDialog] = useState({ isOpen: false })
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

  const handleFetchLyrics = async () => {
    setFetchingLyrics(true)
    setLyricsError(null)
    setLyricsSuccess(false)

    try {
      const response = await fetch('/api/beets/fetch-lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: track.id })
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        const errorMsg = error.error || 'Failed to fetch lyrics from server'

        if (response.status === 404) {
          throw new Error('Lyrics service not found. Make sure the lyrics plugin is enabled in beets config.')
        } else if (response.status >= 500) {
          throw new Error('Server error while fetching lyrics. Please try again.')
        } else {
          throw new Error(errorMsg)
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000))

      const itemResponse = await fetch(`/api/beets/items`)
      if (!itemResponse.ok) {
        throw new Error('Failed to reload track data')
      }

      const items = await itemResponse.json()
      const updatedTrack = items.find(item => item.id === track.id)

      if (!updatedTrack) {
        throw new Error('Track not found after fetching lyrics')
      }

      if (updatedTrack.lyrics?.Valid && updatedTrack.lyrics?.String?.trim().length > 0) {
        setPreviewTrack(updatedTrack)
        setLyricsSuccess(true)
        setTimeout(() => setLyricsSuccess(false), 3000)
      } else {
        setLyricsError('No lyrics found online for this track. The song may not be in lyrics databases, or the metadata may not match.')
      }
    } catch (err) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setLyricsError('Network error. Please check your connection and try again.')
      } else {
        setLyricsError(err.message)
      }
    } finally {
      setFetchingLyrics(false)
    }
  }

  const handleDeleteTrack = () => {
    setDeleteDialog({
      isOpen: true,
      title: 'Delete Track',
      message: `Delete "${getDisplayTitle(track)}" by ${track.artist}?\n\nChoose how you want to delete this track:`,
      buttons: [
        {
          label: 'Cancel',
          variant: 'secondary',
          onClick: () => {}
        },
        {
          label: 'Library Only',
          variant: 'primary',
          onClick: () => performDeleteTrack(false)
        },
        {
          label: 'Delete File',
          variant: 'danger',
          onClick: () => performDeleteTrack(true)
        }
      ]
    })
  }

  const performDeleteTrack = async (deleteFiles) => {
    try {
      const response = await fetch('/api/beets/delete/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: track.id,
          delete_files: deleteFiles
        })
      })

      if (!response.ok) throw new Error('Failed to delete track')

      setAlertDialog({
        isOpen: true,
        title: 'Success',
        message: 'Track deleted successfully!',
        variant: 'success'
      })

      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      setAlertDialog({
        isOpen: true,
        title: 'Error',
        message: err.message,
        variant: 'error'
      })
    }
  }

  const parseLyrics = (lyricsText) => {
    if (!lyricsText) return []

    const lines = lyricsText.split('\n')
    const lrcPattern = /^\[(\d{2}):(\d{2}\.\d{2})\](.*)$/

    return lines.map((line, index) => {
      const match = line.match(lrcPattern)
      if (match) {
        const [, minutes, seconds, text] = match
        const timestamp = `${minutes}:${seconds}`
        return { timestamp, text: text.trim(), hasTimestamp: true }
      }
      return { text: line, hasTimestamp: false }
    }).filter(line => line.text || line.hasTimestamp)
  }

  const getDisplayTitle = (track) => {
    if (track.title?.match(/^#?\d+\s+Missing Track$/i)) {
      const filename = track.path.split('/').pop().replace(/\.[^.]+$/, '')
      return filename
    }
    return track.title
  }

  if (!track) return null

  return (
    <div ref={panelRef} className="w-full h-full">
      <audio ref={audioRef} src={`/api/beets/items/${track.id}/stream`} />

      {/* Mobile drag handle */}
      <div className="lg:hidden flex justify-center pt-2 pb-1">
        <div className="w-12 h-1 bg-neutral-700 rounded-full"></div>
      </div>

      <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 relative">
        <button
          onClick={onClose}
          className="absolute top-1 right-1 lg:top-2 lg:right-2 w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-800/50 text-neutral-500 hover:text-neutral-300 transition-colors z-10"
        >
          <i className="fa-solid fa-xmark text-sm"></i>
        </button>

        {!editMode ? (
          <div className="space-y-4 lg:space-y-6">
            <div className="flex items-start justify-between pr-8 lg:pr-12">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl lg:text-3xl font-light text-neutral-100 mb-1 lg:mb-2 truncate">{getDisplayTitle(track)}</h2>
                <p className="text-base lg:text-lg text-neutral-400 truncate">{track.artist}</p>
              </div>
              <div className="flex flex-col lg:flex-row gap-1 lg:gap-2 flex-shrink-0 ml-2">
                <button
                  onClick={() => setEditMode(true)}
                  className="px-2 lg:px-3 py-1.5 text-xs bg-neutral-800 border border-neutral-700 rounded text-neutral-400 hover:border-rose-500 hover:text-rose-500 transition-colors"
                >
                  <i className="fa-solid fa-pen lg:mr-1"></i>
                  <span className="hidden lg:inline">Edit</span>
                </button>
                <button
                  onClick={handleDeleteTrack}
                  className="px-2 lg:px-3 py-1.5 text-xs bg-neutral-800 border border-neutral-700 rounded text-neutral-400 hover:border-red-500 hover:text-red-500 transition-colors"
                >
                  <i className="fa-solid fa-trash lg:mr-1"></i>
                  <span className="hidden lg:inline">Delete</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 lg:gap-x-6 gap-y-3 lg:gap-y-4 text-sm">
              <div>
                <span className="text-neutral-500 text-xs uppercase tracking-wider">Album</span>
                <p className="text-neutral-200 mt-1">{track.album}</p>
              </div>
              {track.track?.Valid && (
                <div>
                  <span className="text-neutral-500 text-xs uppercase tracking-wider">Track</span>
                  <p className="text-neutral-200 mt-1">
                    #{track.track.Int64}
                    {track.tracktotal?.Valid && track.tracktotal.Int64 > 0 && ` / ${track.tracktotal.Int64}`}
                  </p>
                </div>
              )}
              {track.disc?.Valid && track.disc.Int64 > 0 && (
                <div>
                  <span className="text-neutral-500 text-xs uppercase tracking-wider">Disc</span>
                  <p className="text-neutral-200 mt-1">
                    {track.disc.Int64}
                    {track.disctotal?.Valid && track.disctotal.Int64 > 1 && ` / ${track.disctotal.Int64}`}
                  </p>
                </div>
              )}
              {track.isrc?.Valid && track.isrc.String && (
                <div>
                  <span className="text-neutral-500 text-xs uppercase tracking-wider">ISRC</span>
                  <p className="text-neutral-200 mt-1 font-mono text-xs">{track.isrc.String}</p>
                </div>
              )}
              {track.genres?.Valid && track.genres.String && (
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

            <button
              onClick={handlePlay}
              className="w-full py-3 bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 hover:border-rose-500 rounded-lg flex items-center justify-center gap-3 text-neutral-300 hover:text-rose-400 font-medium transition-all"
            >
              <i className={`fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'} text-sm`}></i>
              {isPlaying ? 'Playing...' : 'Preview (30s)'}
            </button>

            <div className="pt-6 border-t border-neutral-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Lyrics</h3>
                {(!track.lyrics?.Valid || !track.lyrics?.String) && (
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

              {lyricsSuccess && (
                <div className="mb-4 p-3 bg-rose-950/30 border border-rose-900/50 rounded text-sm text-rose-400 flex items-center gap-2">
                  <i className="fa-solid fa-check-circle"></i>
                  Lyrics found and saved!
                </div>
              )}

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

              {fetchingLyrics && (
                <div className="mb-4 p-3 bg-neutral-800/50 border border-neutral-700 rounded text-sm text-neutral-400 flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-neutral-600 border-t-rose-500 rounded-full animate-spin"></div>
                  <div>
                    <p className="font-medium">Searching for lyrics...</p>
                    <p className="text-xs text-neutral-500 mt-0.5">This may take a few moments</p>
                  </div>
                </div>
              )}

              <div className="text-sm leading-relaxed max-h-96 overflow-y-auto">
                {track.lyrics?.Valid && track.lyrics?.String ? (
                  <div className="space-y-1">
                    {parseLyrics(track.lyrics.String).map((line, index) => (
                      <div key={index} className="flex gap-3 items-start">
                        {line.hasTimestamp && (
                          <span className="text-neutral-600 font-mono text-xs flex-shrink-0 w-14 text-right select-none">
                            {line.timestamp}
                          </span>
                        )}
                        <span className={`${line.hasTimestamp ? 'text-neutral-300' : 'text-neutral-500'} flex-1`}>
                          {line.text}
                        </span>
                      </div>
                    ))}
                  </div>
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

        <div className="pt-4 border-t border-neutral-800">
          <p className="text-xs text-neutral-600 font-mono break-all">{track.path}</p>
        </div>
      </div>

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
  )
}
