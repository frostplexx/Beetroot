import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function DuplicatesTool() {
  const navigate = useNavigate()
  const [duplicates, setDuplicates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mergeDialog, setMergeDialog] = useState(null)
  const [merging, setMerging] = useState(false)

  useEffect(() => {
    loadDuplicates()
  }, [])

  const loadDuplicates = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/beets/duplicates')
      const data = await response.json()

      if (Array.isArray(data)) {
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

  const handleMerge = async (duplicate) => {
    try {
      // Fetch full details about both albums
      const [album1Res, album2Res, tracks1Res, tracks2Res] = await Promise.all([
        fetch(`/api/beets/albums/by-id/${duplicate.album1_id}`),
        fetch(`/api/beets/albums/by-id/${duplicate.album2_id}`),
        fetch(`/api/beets/items/by-album/${duplicate.album1_id}`),
        fetch(`/api/beets/items/by-album/${duplicate.album2_id}`)
      ])

      const [album1, album2, tracks1, tracks2] = await Promise.all([
        album1Res.json(),
        album2Res.json(),
        tracks1Res.json(),
        tracks2Res.json()
      ])

      setMergeDialog({
        album1,
        album2,
        tracks1,
        tracks2,
        duplicate
      })
    } catch (err) {
      alert('Error loading album details: ' + err.message)
    }
  }

  const performMerge = async (keepAlbumId, discardAlbumId) => {
    setMerging(true)
    try {
      const response = await fetch('/api/beets/duplicates/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keep_album_id: keepAlbumId,
          discard_album_id: discardAlbumId
        })
      })

      if (!response.ok) throw new Error('Failed to merge albums')

      setMergeDialog(null)
      loadDuplicates()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setMerging(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950">
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
      <div className="max-w-7xl mx-auto px-6 py-8">
        <button
          onClick={() => navigate('/tools')}
          className="mb-6 text-sm text-neutral-500 hover:text-neutral-300 flex items-center gap-2"
        >
          <i className="fa-solid fa-arrow-left"></i>
          Back to Tools
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-light text-neutral-200 mb-2">Find Duplicates</h1>
          <p className="text-sm text-neutral-400">
            {duplicates.length === 0
              ? 'No duplicates found in your library'
              : `Found ${duplicates.length} potential duplicate${duplicates.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-950/20 border border-red-900/50 rounded text-red-400 text-sm">
            {error}
          </div>
        )}

        {duplicates.length > 0 && (
          <div className="space-y-4">
            {duplicates.map((dup, index) => (
              <div
                key={index}
                className="p-5 bg-neutral-900 border border-neutral-800 rounded"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-neutral-200 font-medium">{dup.info.split(' - ')[0]}</p>
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-400">{dup.album1}</span>
                        <span className="text-xs text-neutral-600">•</span>
                        <span className="text-neutral-500">{dup.tracks1} track{dup.tracks1 !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-400">{dup.album2}</span>
                        <span className="text-xs text-neutral-600">•</span>
                        <span className="text-neutral-500">{dup.tracks2} track{dup.tracks2 !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-xs text-neutral-500">
                      {Math.round(dup.similarity * 100)}% similar
                    </div>
                    <button
                      onClick={() => handleMerge(dup)}
                      className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-300 hover:border-rose-500 hover:text-rose-500 transition-colors"
                    >
                      Merge Albums
                    </button>
                  </div>
                </div>
                {dup.tracks1 !== dup.tracks2 && (
                  <div className="mt-3 pt-3 border-t border-neutral-800 text-xs text-amber-400 flex items-center gap-2">
                    <i className="fa-solid fa-exclamation-triangle"></i>
                    <span>Different track counts - likely partial imports</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 border border-neutral-800 rounded p-4 bg-neutral-900/50">
          <h3 className="text-sm font-medium text-neutral-300 mb-2">How it works</h3>
          <ul className="text-xs text-neutral-500 space-y-1">
            <li>• Finds albums with the same artist and similar album names</li>
            <li>• Useful for merging split albums (Standard, Deluxe, Anniversary editions)</li>
            <li>• Completely different versions won't be flagged as duplicates</li>
            <li>• Merging combines tracks and metadata from both albums</li>
          </ul>
        </div>

        {/* Merge Dialog */}
        {mergeDialog && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => !merging && setMergeDialog(null)}>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-neutral-800">
                <h2 className="text-xl font-medium text-neutral-200 mb-2">Merge Albums</h2>
                <p className="text-sm text-neutral-400">Choose which album to keep. All tracks will be moved to the selected album.</p>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-2 gap-6">
                  {/* Album 1 */}
                  <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-950">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-medium text-neutral-200">{mergeDialog.album1.album}</h3>
                        <p className="text-sm text-neutral-400">{mergeDialog.album1.albumartist}</p>
                        <p className="text-xs text-neutral-500 mt-1">{mergeDialog.tracks1.length} tracks</p>
                      </div>
                    </div>
                    <div className="space-y-1 mb-4">
                      {mergeDialog.tracks1.map(track => (
                        <div key={track.id} className="text-xs text-neutral-400 flex gap-2">
                          <span className="text-neutral-600">{track.track?.Valid ? track.track.Int64 : '-'}</span>
                          <span className="flex-1 truncate">{track.title}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => performMerge(mergeDialog.album1.id, mergeDialog.album2.id)}
                      disabled={merging}
                      className="w-full px-4 py-2 bg-rose-500 text-white rounded hover:bg-rose-600 disabled:opacity-50 text-sm font-medium transition-colors"
                    >
                      Keep This Album
                    </button>
                  </div>

                  {/* Album 2 */}
                  <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-950">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-medium text-neutral-200">{mergeDialog.album2.album}</h3>
                        <p className="text-sm text-neutral-400">{mergeDialog.album2.albumartist}</p>
                        <p className="text-xs text-neutral-500 mt-1">{mergeDialog.tracks2.length} tracks</p>
                      </div>
                    </div>
                    <div className="space-y-1 mb-4">
                      {mergeDialog.tracks2.map(track => (
                        <div key={track.id} className="text-xs text-neutral-400 flex gap-2">
                          <span className="text-neutral-600">{track.track?.Valid ? track.track.Int64 : '-'}</span>
                          <span className="flex-1 truncate">{track.title}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => performMerge(mergeDialog.album2.id, mergeDialog.album1.id)}
                      disabled={merging}
                      className="w-full px-4 py-2 bg-rose-500 text-white rounded hover:bg-rose-600 disabled:opacity-50 text-sm font-medium transition-colors"
                    >
                      Keep This Album
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-neutral-800 flex justify-end">
                <button
                  onClick={() => setMergeDialog(null)}
                  disabled={merging}
                  className="px-4 py-2 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 disabled:opacity-50 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
