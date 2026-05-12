import { useState, useEffect } from 'react'
import { Header } from '../components/common/Header'
import { LoadingSpinner } from '../components/common/LoadingSpinner'

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
            <label className="flex items-center gap-2 text-sm text-neutral-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-neutral-700 bg-neutral-900 text-rose-500 focus:ring-rose-500"
              />
              Auto-refresh
            </label>

            <button
              onClick={loadLogs}
              className="px-3 py-1.5 text-sm bg-neutral-900 border border-neutral-800 rounded text-neutral-300 hover:border-rose-500 hover:text-rose-500"
            >
              <i className="fa-solid fa-rotate mr-2"></i>
              Refresh
            </button>

            <button
              onClick={clearLogs}
              className="px-3 py-1.5 text-sm bg-neutral-900 border border-neutral-800 rounded text-neutral-300 hover:border-red-500 hover:text-red-500"
            >
              <i className="fa-solid fa-trash mr-2"></i>
              Clear
            </button>
          </div>
        </div>

        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded px-4 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded px-4 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
          >
            <option value="all">All Levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>

        <div className="border border-neutral-800 rounded overflow-hidden">
          <div className="bg-neutral-900/50 p-4 font-mono text-xs space-y-1 max-h-[70vh] overflow-y-auto">
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
                    <span className="text-neutral-600 shrink-0">
                      {formatTimestamp(log.timestamp)}
                    </span>
                    <span className={`${getLevelColor(log.level)} uppercase font-medium shrink-0 w-12`}>
                      {log.level || 'LOG'}
                    </span>
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
        </div>
      </div>
    </div>
  )
}
