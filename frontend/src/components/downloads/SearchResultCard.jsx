import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export function SearchResultCard({ result }) {
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const response = await fetch('/api/downloads/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search_result: result,
          auto_import: true
        })
      })

      if (response.ok) {
        toast.success(`Added "${result.title}" to download queue`)
      } else {
        const error = await response.text()
        toast.error(`Failed to queue download: ${error}`)
      }
    } catch (error) {
      console.error('Failed to queue download:', error)
      toast.error('Failed to queue download')
    } finally {
      setDownloading(false)
    }
  }

  const formatDuration = (seconds) => {
    if (!seconds) return ''
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <Card className="hover:border-rose-500/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex gap-3">
          {result.artwork_url ? (
            <img
              src={result.artwork_url}
              alt={result.title}
              className="w-16 h-16 rounded object-cover flex-shrink-0"
              onError={(e) => {
                e.target.style.display = 'none'
              }}
            />
          ) : (
            <div className="w-16 h-16 rounded bg-neutral-900 flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-music text-2xl text-neutral-700"></i>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-neutral-200 truncate" title={result.title}>
              {result.title}
            </h4>
            {result.artist && (
              <p className="text-sm text-neutral-400 truncate" title={result.artist}>
                {result.artist}
              </p>
            )}
            {result.album && (
              <p className="text-xs text-neutral-500 truncate" title={result.album}>
                {result.album}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                {result.type}
              </Badge>
              {result.duration && (
                <span className="text-xs text-neutral-500">
                  {formatDuration(result.duration)}
                </span>
              )}
              {result.year && (
                <span className="text-xs text-neutral-500">
                  {result.year}
                </span>
              )}
            </div>
          </div>
        </div>

        <Button
          className="w-full mt-3"
          size="sm"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? (
            <>
              <i className="fa-solid fa-spinner fa-spin mr-2"></i>
              Adding...
            </>
          ) : (
            <>
              <i className="fa-solid fa-download mr-2"></i>
              Download & Import
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
