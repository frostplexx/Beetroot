import { useState, useEffect } from 'react'

export function EditMetadataModal({ album, isOpen, onClose, onSave }) {
  const [formData, setFormData] = useState({
    album: '',
    albumartist: '',
    year: '',
    month: '',
    day: '',
    label: '',
    genre: '',
    country: '',
    catalognum: '',
    barcode: '',
    albumtype: '',
    albumstatus: '',
    disctotal: '',
    comp: '0',
  })
  const [recommendations, setRecommendations] = useState(null)
  const [alternatives, setAlternatives] = useState(null)
  const [sourcesUsed, setSourcesUsed] = useState(0)
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  const [recommendationsError, setRecommendationsError] = useState(null)

  useEffect(() => {
    if (album && isOpen) {
      // Format genres from null-byte separated to comma-separated for editing
      const genreString = album.genres?.Valid ? album.genres.String : ''
      const formattedGenres = genreString ? genreString.split(String.fromCharCode(0)).filter(g => g.trim()).join(', ') : ''

      setFormData({
        album: album.album || '',
        albumartist: album.albumartist || '',
        year: album.year?.Valid ? album.year.Int64.toString() : '',
        month: album.month?.Valid ? album.month.Int64.toString() : '',
        day: album.day?.Valid ? album.day.Int64.toString() : '',
        label: album.label?.Valid ? album.label.String : '',
        genre: formattedGenres,
        country: album.country?.Valid ? album.country.String : '',
        catalognum: album.catalognum?.Valid ? album.catalognum.String : '',
        barcode: album.barcode?.Valid ? album.barcode.String : '',
        albumtype: album.albumtype?.Valid ? album.albumtype.String : '',
        albumstatus: album.albumstatus?.Valid ? album.albumstatus.String : '',
        disctotal: album.disctotal?.Valid ? album.disctotal.Int64.toString() : '',
        comp: album.comp?.Valid ? album.comp.Int64.toString() : '0',
      })

      // Fetch MusicBrainz recommendations
      fetchRecommendations()
    }
  }, [album, isOpen])

  const fetchRecommendations = async () => {
    if (!album) return

    setLoadingRecommendations(true)
    setRecommendationsError(null)
    setSourcesUsed(0)
    setAlternatives(null)
    try {
      const response = await fetch(`/api/beets/mb-recommendations?album_id=${album.id}`)
      const data = await response.json()

      if (response.ok && data.recommendations) {
        const recCount = Object.keys(data.recommendations).length
        if (recCount === 0) {
          setRecommendationsError('No metadata found from any source')
        }
        setRecommendations(data.recommendations)
        setAlternatives(data.alternatives || null)
        setSourcesUsed(data.sources_used || 0)
      } else {
        const errorMsg = data.error || 'Failed to fetch suggestions'
        setRecommendationsError(errorMsg)
        setRecommendations(null)
        setAlternatives(null)
        setSourcesUsed(0)
      }
    } catch (err) {
      console.error('Failed to fetch recommendations:', err)
      setRecommendationsError('Network error')
      setRecommendations(null)
      setAlternatives(null)
      setSourcesUsed(0)
    } finally {
      setLoadingRecommendations(false)
    }
  }

  const applyRecommendation = (field, value) => {
    setFormData({ ...formData, [field]: value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Get original values for comparison
    const originalYear = album.year?.Valid ? album.year.Int64.toString() : ''
    const originalMonth = album.month?.Valid ? album.month.Int64.toString() : ''
    const originalDay = album.day?.Valid ? album.day.Int64.toString() : ''
    const originalLabel = album.label?.Valid ? album.label.String : ''
    const originalGenre = album.genres?.Valid
      ? album.genres.String.split(String.fromCharCode(0)).filter(g => g.trim()).join(', ')
      : ''
    const originalCountry = album.country?.Valid ? album.country.String : ''
    const originalCatalogNum = album.catalognum?.Valid ? album.catalognum.String : ''
    const originalBarcode = album.barcode?.Valid ? album.barcode.String : ''
    const originalAlbumType = album.albumtype?.Valid ? album.albumtype.String : ''
    const originalAlbumStatus = album.albumstatus?.Valid ? album.albumstatus.String : ''
    const originalDiscTotal = album.disctotal?.Valid ? album.disctotal.Int64.toString() : ''
    const originalComp = album.comp?.Valid ? album.comp.Int64.toString() : '0'

    const updates = {}

    // Only include fields that actually changed
    if (formData.album !== album.album) {
      updates.album = formData.album
    }
    if (formData.albumartist !== album.albumartist) {
      updates.albumartist = formData.albumartist
    }
    if (formData.year !== originalYear && formData.year !== '') {
      updates.year = formData.year
    }
    if (formData.month !== originalMonth && formData.month !== '') {
      updates.month = formData.month
    }
    if (formData.day !== originalDay && formData.day !== '') {
      updates.day = formData.day
    }
    if (formData.label !== originalLabel && formData.label !== '') {
      updates.label = formData.label
    }
    if (formData.genre !== originalGenre && formData.genre !== '') {
      updates.genre = formData.genre
    }
    if (formData.country !== originalCountry && formData.country !== '') {
      updates.country = formData.country
    }
    if (formData.catalognum !== originalCatalogNum && formData.catalognum !== '') {
      updates.catalognum = formData.catalognum
    }
    if (formData.barcode !== originalBarcode && formData.barcode !== '') {
      updates.barcode = formData.barcode
    }
    if (formData.albumtype !== originalAlbumType && formData.albumtype !== '') {
      updates.albumtype = formData.albumtype
    }
    if (formData.albumstatus !== originalAlbumStatus && formData.albumstatus !== '') {
      updates.albumstatus = formData.albumstatus
    }
    if (formData.disctotal !== originalDiscTotal && formData.disctotal !== '') {
      updates.disctotal = formData.disctotal
    }
    if (formData.comp !== originalComp) {
      updates.comp = formData.comp
    }

    console.log('Changes detected:', updates)

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

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to update metadata')
      }

      // Wait a moment for beets to finish writing to database
      await new Promise(resolve => setTimeout(resolve, 500))

      alert('Metadata updated successfully!')
      onSave()
      onClose()
    } catch (err) {
      alert('Error: ' + err.message)
      console.error('Update error:', err)
    }
  }

  if (!isOpen) return null

  const renderField = (label, field, value) => {
    const recValue = recommendations?.[field]
    const hasRecommendation = recValue &&
                              typeof recValue === 'string' &&
                              recValue.trim() !== '' &&
                              recValue !== value

    const fieldAlternatives = alternatives?.[field] || []
    const hasAlternatives = fieldAlternatives.length > 0

    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm text-neutral-400">{label}</label>
          {hasRecommendation && !hasAlternatives && (
            <button
              type="button"
              onClick={() => applyRecommendation(field, recValue)}
              className="text-xs px-2 py-0.5 bg-rose-500/20 text-rose-400 rounded hover:bg-rose-500/30 flex items-center gap-1 transition-colors"
              title={`Apply suggestion: ${recValue}`}
            >
              <span className="truncate max-w-[120px]">{recValue}</span>
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          )}
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
          className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
        />
        {hasAlternatives && (
          <div className="mt-2 flex flex-wrap gap-1">
            {fieldAlternatives.map((alt, idx) => {
              const isSelected = alt.value === value
              const isTopChoice = idx === 0
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => applyRecommendation(field, alt.value)}
                  disabled={isSelected}
                  className={`text-xs px-2 py-1 rounded flex items-center gap-1.5 transition-colors ${
                    isSelected
                      ? 'bg-rose-500/30 text-rose-300 cursor-default'
                      : isTopChoice
                      ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                      : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                  }`}
                  title={`${alt.sources.join(', ')} (${alt.votes} vote${alt.votes !== 1 ? 's' : ''})`}
                >
                  <span className="truncate max-w-[200px]">{alt.value}</span>
                  {isSelected && (
                    <i className="fa-solid fa-check text-[10px]"></i>
                  )}
                  {!isSelected && isTopChoice && (
                    <i className="fa-solid fa-star text-[10px]"></i>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 overflow-y-auto py-8" onClick={onClose}>
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 max-w-3xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-neutral-200">Edit Metadata</h2>
          {loadingRecommendations && (
            <span className="text-xs text-neutral-500 flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-neutral-600 border-t-rose-500 rounded-full animate-spin"></div>
              Loading suggestions...
            </span>
          )}
          {!loadingRecommendations && recommendationsError && (
            <span className="text-xs text-neutral-500" title={recommendationsError}>
              <i className="fa-solid fa-circle-exclamation text-amber-500"></i> {recommendationsError}
            </span>
          )}
          {!loadingRecommendations && !recommendationsError && recommendations && Object.keys(recommendations).length > 0 && (
            <span className="text-xs text-rose-400" title={`Aggregated from ${sourcesUsed} source${sourcesUsed !== 1 ? 's' : ''}`}>
              <i className="fa-solid fa-sparkles"></i> {Object.keys(recommendations).length} suggestion{Object.keys(recommendations).length !== 1 ? 's' : ''} ({sourcesUsed} source{sourcesUsed !== 1 ? 's' : ''})
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-4">
            {renderField('Album', 'album', formData.album)}
            {renderField('Album Artist', 'albumartist', formData.albumartist)}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {renderField('Year', 'year', formData.year)}
            {renderField('Month', 'month', formData.month)}
            {renderField('Day', 'day', formData.day)}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {renderField('Label', 'label', formData.label)}
            {renderField('Country', 'country', formData.country)}
          </div>

          {renderField('Genre', 'genre', formData.genre)}

          <div className="grid grid-cols-2 gap-4">
            {renderField('Catalog Number', 'catalognum', formData.catalognum)}
            {renderField('Barcode', 'barcode', formData.barcode)}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {renderField('Album Type', 'albumtype', formData.albumtype)}
            {renderField('Album Status', 'albumstatus', formData.albumstatus)}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {renderField('Disc Total', 'disctotal', formData.disctotal)}
            <div>
              <label className="block text-sm text-neutral-400 mb-1">Compilation</label>
              <select
                value={formData.comp}
                onChange={(e) => setFormData({ ...formData, comp: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
              >
                <option value="0">No</option>
                <option value="1">Yes</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2 pt-2 sticky bottom-0 bg-neutral-900 pt-4 -mx-2 px-2">
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
