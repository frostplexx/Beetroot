import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../common/Header'

export function DuplicatesTool() {
  const navigate = useNavigate()
  const [duplicates, setDuplicates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
                className="p-4 bg-neutral-900 border border-neutral-800 rounded flex items-center justify-between"
              >
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

        <div className="mt-8 border border-neutral-800 rounded p-4 bg-neutral-900/50">
          <h3 className="text-sm font-medium text-neutral-300 mb-2">How it works</h3>
          <ul className="text-xs text-neutral-500 space-y-1">
            <li>• Finds albums with the same artist and similar album names</li>
            <li>• Useful for merging split albums (Standard, Deluxe, Anniversary editions)</li>
            <li>• Completely different versions won't be flagged as duplicates</li>
            <li>• Merging combines tracks and metadata from both albums</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
