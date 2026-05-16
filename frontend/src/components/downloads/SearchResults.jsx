import { Badge } from '@/components/ui/badge'
import { SearchResultCard } from './SearchResultCard'

export function SearchResults({ results }) {
  // Group results by extension
  const groupedResults = results.reduce((acc, result) => {
    const extName = result.extension_name || 'Unknown'
    if (!acc[extName]) {
      acc[extName] = []
    }
    acc[extName].push(result)
    return acc
  }, {})

  return (
    <div className="space-y-8">
      {Object.entries(groupedResults).map(([extName, extResults]) => (
        <div key={extName}>
          <div className="flex items-center gap-2 mb-4">
            <i className="fa-solid fa-puzzle-piece text-rose-500"></i>
            <h3 className="text-lg font-medium text-neutral-200">{extName}</h3>
            <Badge variant="secondary">{extResults.length} results</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {extResults.map((result, idx) => (
              <SearchResultCard key={`${result.extension_id}-${idx}`} result={result} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
