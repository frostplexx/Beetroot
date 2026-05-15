import { useState, useEffect } from 'react'
import { Header } from '../components/common/Header'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'

export function LogsPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [filter, setFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('all')

  const loadLogs = async () => {
    try {
      const res = await fetch('/api/logs?limit=500')
      if (!res.ok) throw new Error('Failed to load logs')
      const data = await res.json()
      setLogs(data.logs || [])
      setLoading(false)
    } catch (err) {
      console.error('Error loading logs:', err)
      setLoading(false)
    }
  }

  const clearLogs = async () => {
    if (!confirm('Clear all logs?')) return
    try {
      const res = await fetch('/api/logs/clear', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to clear logs')
      setLogs([])
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      loadLogs()
    }, 2000)

    return () => clearInterval(interval)
  }, [autoRefresh])

  const getLevelColor = (level) => {
    switch (level?.toLowerCase()) {
      case 'error':
      case 'fatal':
        return 'text-red-400'
      case 'warn':
        return 'text-yellow-400'
      case 'info':
        return 'text-blue-400'
      case 'debug':
        return 'text-neutral-500'
      default:
        return 'text-neutral-400'
    }
  }

  const getLevelBg = (level) => {
    switch (level?.toLowerCase()) {
      case 'error':
      case 'fatal':
        return 'bg-red-950/30 border-red-900/50'
      case 'warn':
        return 'bg-yellow-950/30 border-yellow-900/50'
      case 'info':
        return 'bg-blue-950/30 border-blue-900/50'
      case 'debug':
        return 'bg-neutral-900/30 border-neutral-800'
      default:
        return 'bg-neutral-900/30 border-neutral-800'
    }
  }

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    })
  }

  const filteredLogs = logs.filter(log => {
    // Level filter
    if (levelFilter !== 'all' && log.level?.toLowerCase() !== levelFilter) {
      return false
    }

    // Text filter
    if (filter && !log.message?.toLowerCase().includes(filter.toLowerCase())) {
      return false
    }

    return true
  })

  if (loading) {
    return <LoadingSpinner message="Loading logs..." />
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-light text-neutral-100">Backend Logs</h1>
            <p className="text-sm text-neutral-500 mt-1">
              {filteredLogs.length} of {logs.length} entries
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
              />
              <Label htmlFor="auto-refresh" className="text-sm text-neutral-400 cursor-pointer">
                Auto-refresh
              </Label>
            </div>

            <Button
              onClick={loadLogs}
              variant="outline"
              size="sm"
            >
              <i className="fa-solid fa-rotate mr-2"></i>
              Refresh
            </Button>

            <Button
              onClick={clearLogs}
              variant="outline"
              size="sm"
              className="hover:border-red-500 hover:text-red-500"
            >
              <i className="fa-solid fa-trash mr-2"></i>
              Clear
            </Button>
          </div>
        </div>

        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="debug">Debug</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warn">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border border-neutral-800 rounded overflow-hidden">
          <ScrollArea className="h-[70vh] bg-neutral-900/50 p-4">
            <div className="font-mono text-xs space-y-1">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-neutral-500">
                No logs found
              </div>
            ) : (
              filteredLogs.map((log, index) => (
                <div
                  key={index}
                  className={`border rounded p-2 ${getLevelBg(log.level)}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-neutral-600 shrink-0 font-mono text-xs">
                      {formatTimestamp(log.timestamp)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`${getLevelColor(log.level)} uppercase font-medium shrink-0 text-[10px] h-5`}
                    >
                      {log.level || 'LOG'}
                    </Badge>
                    <span className="text-neutral-300 flex-1">
                      {log.message}
                    </span>
                  </div>
                  {log.fields && Object.keys(log.fields).length > 0 && (
                    <div className="mt-1 ml-[140px] text-neutral-500 text-xs">
                      {Object.entries(log.fields).map(([key, value]) => (
                        <span key={key} className="mr-3">
                          {key}={JSON.stringify(value)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
