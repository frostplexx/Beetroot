import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SearchResults } from './SearchResults'
import { LoadingSpinner } from '../common/LoadingSpinner'

export function SearchSection() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSearch = async (e) => {
    if (e) e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/extensions/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          types: ['track', 'album']
        })
      })

      if (!response.ok) {
        throw new Error('Search failed')
      }

      const data = await response.json()
      setResults(data.results || [])
    } catch (err) {
      console.error('Search error:', err)
      setError('Search failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for songs, albums, or artists..."
          className="flex-1"
          disabled={loading}
        />
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? (
            <>
              <i className="fa-solid fa-spinner fa-spin mr-2"></i>
              Searching...
            </>
          ) : (
            <>
              <i className="fa-solid fa-search mr-2"></i>
              Search
            </>
          )}
        </Button>
      </form>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
          <i className="fa-solid fa-exclamation-triangle mr-2"></i>
          {error}
        </div>
      )}

      {loading && (
        <div className="py-12">
          <LoadingSpinner message="Searching extensions..." />
        </div>
      )}

      {!loading && results.length === 0 && query && !error && (
        <div className="text-center py-12 text-neutral-500">
          <i className="fa-solid fa-search text-4xl mb-4 opacity-50"></i>
          <p>No results found for "{query}"</p>
          <p className="text-sm mt-2">Try different keywords or check if extensions are installed</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <SearchResults results={results} />
      )}
    </div>
  )
}
