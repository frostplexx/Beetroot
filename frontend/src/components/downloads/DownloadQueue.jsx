import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

export function DownloadQueue() {
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadQueue()
    const interval = setInterval(loadQueue, 2000) // Poll every 2 seconds
    return () => clearInterval(interval)
  }, [])

  const loadQueue = async () => {
    try {
      const response = await fetch('/api/downloads/queue')
      const data = await response.json()
      setQueue(data.queue || [])
    } catch (error) {
      console.error('Failed to load queue:', error)
    } finally {
      setLoading(false)
    }
  }

  const cancelDownload = async (id) => {
    try {
      await fetch(`/api/downloads/${id}`, { method: 'DELETE' })
      loadQueue()
    } catch (error) {
      console.error('Failed to cancel download:', error)
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return { icon: 'fa-clock', color: 'text-neutral-400' }
      case 'downloading':
        return { icon: 'fa-spinner fa-spin', color: 'text-blue-400' }
      case 'completed':
        return { icon: 'fa-check-circle', color: 'text-green-400' }
      case 'failed':
        return { icon: 'fa-exclamation-circle', color: 'text-red-400' }
      case 'importing':
        return { icon: 'fa-file-import', color: 'text-rose-400' }
      default:
        return { icon: 'fa-circle', color: 'text-neutral-500' }
    }
  }

  const getStatusBadge = (status) => {
    const variants = {
      pending: 'secondary',
      downloading: 'default',
      completed: 'default',
      failed: 'destructive',
      importing: 'default'
    }
    return variants[status] || 'secondary'
  }

  if (loading) {
    return <div className="text-center py-8 text-neutral-500">Loading queue...</div>
  }

  if (queue.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-neutral-800 rounded-lg">
        <i className="fa-solid fa-inbox text-6xl text-neutral-700 mb-4"></i>
        <h3 className="text-xl font-medium text-neutral-300 mb-2">
          Download queue is empty
        </h3>
        <p className="text-neutral-500">
          Search for music to add downloads to the queue
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {queue.map((item) => {
        const statusInfo = getStatusIcon(item.status)
        return (
          <Card key={item.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <i className={`fa-solid ${statusInfo.icon} ${statusInfo.color}`}></i>
                    <h4 className="font-medium text-neutral-200 truncate">
                      {item.title}
                    </h4>
                    <Badge variant={getStatusBadge(item.status)} className="text-xs">
                      {item.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-neutral-400 truncate">
                    {item.artist}
                    {item.album && ` • ${item.album}`}
                  </p>

                  {item.status === 'downloading' && (
                    <div className="mt-2">
                      <Progress value={item.progress * 100} className="h-2" />
                      <p className="text-xs text-neutral-500 mt-1">
                        {Math.round(item.progress * 100)}%
                      </p>
                    </div>
                  )}

                  {item.status === 'failed' && item.error_message && (
                    <p className="text-xs text-red-400 mt-1">
                      {item.error_message}
                    </p>
                  )}

                  {item.status === 'completed' && item.file_path && (
                    <p className="text-xs text-green-400 mt-1">
                      <i className="fa-solid fa-check mr-1"></i>
                      Downloaded successfully
                    </p>
                  )}
                </div>

                {(item.status === 'pending' || item.status === 'downloading') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cancelDownload(item.id)}
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
