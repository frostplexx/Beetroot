import { useState, useEffect } from 'react'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { Pagination } from '../components/common/Pagination'

export function AuditLogPage() {
  const [logs, setLogs] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState({
    action: '',
    target_type: ''
  })
  const logsPerPage = 50

  useEffect(() => {
    loadLogs()
    loadStats()
  }, [page, filter])

  const loadLogs = async () => {
    setLoading(true)
    try {
      const offset = page * logsPerPage
      const params = new URLSearchParams({
        limit: logsPerPage.toString(),
        offset: offset.toString(),
      })

      if (filter.action) params.append('action', filter.action)
      if (filter.target_type) params.append('target_type', filter.target_type)

      const res = await fetch(`/api/audit/logs?${params}`)
      if (!res.ok) throw new Error('Failed to load audit logs')

      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const res = await fetch('/api/audit/stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (err) {
      console.error('Failed to load stats:', err)
    }
  }

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const getActionIcon = (action) => {
    const icons = {
      modify_album: 'fa-pen-to-square',
      modify_item: 'fa-pen-to-square',
      refetch_metadata: 'fa-rotate',
      refetch_art: 'fa-image',
      fetch_lyrics: 'fa-music',
      delete_album: 'fa-trash',
      delete_item: 'fa-trash',
      upload: 'fa-upload',
      import: 'fa-file-import',
      beets_command: 'fa-terminal',
    }
    return icons[action] || 'fa-circle'
  }

  const getActionColor = (action) => {
    if (action.startsWith('delete')) return 'text-red-400'
    if (action.startsWith('modify')) return 'text-blue-400'
    if (action.startsWith('refetch') || action.startsWith('fetch')) return 'text-rose-400'
    if (action === 'import' || action === 'upload') return 'text-green-400'
    return 'text-neutral-400'
  }

  const getActionLabel = (action) => {
    return action.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  if (loading && logs.length === 0) {
    return <LoadingSpinner message="Loading audit logs..." />
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
        <div className="border border-red-900/50 bg-red-950/20 rounded-xl p-8 max-w-lg w-full">
          <h2 className="text-xl font-bold text-red-200">Error</h2>
          <p className="text-red-400 mt-2">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto px-3 py-4 md:py-8 w-full max-w-[1800px]">
      {/* Header with Stats */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-100 mb-4">Audit Log</h1>

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <div className="text-sm text-neutral-400 mb-1">Total Events</div>
              <div className="text-2xl font-bold text-neutral-100">{stats.total.toLocaleString()}</div>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <div className="text-sm text-neutral-400 mb-1">Last 24 Hours</div>
              <div className="text-2xl font-bold text-rose-400">{stats.recent_24h.toLocaleString()}</div>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <div className="text-sm text-neutral-400 mb-1">Modifications</div>
              <div className="text-2xl font-bold text-blue-400">
                {((stats.action_counts?.modify_album || 0) + (stats.action_counts?.modify_item || 0)).toLocaleString()}
              </div>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <div className="text-sm text-neutral-400 mb-1">Beets Commands</div>
              <div className="text-2xl font-bold text-neutral-400">{(stats.action_counts?.beets_command || 0).toLocaleString()}</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <select
            value={filter.action}
            onChange={(e) => {
              setFilter({ ...filter, action: e.target.value })
              setPage(0)
            }}
            className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
          >
            <option value="">All Actions</option>
            <option value="modify_album">Modify Album</option>
            <option value="modify_item">Modify Item</option>
            <option value="refetch_metadata">Refetch Metadata</option>
            <option value="refetch_art">Refetch Art</option>
            <option value="fetch_lyrics">Fetch Lyrics</option>
            <option value="delete_album">Delete Album</option>
            <option value="delete_item">Delete Item</option>
            <option value="beets_command">Beets Command</option>
          </select>

          <select
            value={filter.target_type}
            onChange={(e) => {
              setFilter({ ...filter, target_type: e.target.value })
              setPage(0)
            }}
            className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
          >
            <option value="">All Types</option>
            <option value="album">Album</option>
            <option value="item">Track</option>
            <option value="system">System</option>
          </select>

          {(filter.action || filter.target_type) && (
            <button
              onClick={() => {
                setFilter({ action: '', target_type: '' })
                setPage(0)
              }}
              className="text-xs px-3 py-2 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 transition-colors"
            >
              <i className="fa-solid fa-xmark mr-1"></i>
              Clear Filters
            </button>
          )}
        </div>

        {/* Pagination */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-neutral-500">
            {total.toLocaleString()} total events
          </span>
          <Pagination
            currentPage={page}
            totalItems={total}
            itemsPerPage={logsPerPage}
            onPageChange={setPage}
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-950 border-b border-neutral-800">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase">Time</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase">Action</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase">Target</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase">Details</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase">Duration</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-neutral-800 hover:bg-neutral-800/50 transition-colors">
                  <td className="px-4 py-3 text-xs text-neutral-400 whitespace-nowrap">
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <i className={`fa-solid ${getActionIcon(log.action)} ${getActionColor(log.action)}`}></i>
                      <span className="text-sm text-neutral-200">{getActionLabel(log.action)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-neutral-200">{log.target_name}</div>
                    <div className="text-xs text-neutral-500">{log.target_type}</div>
                  </td>
                  <td className="px-4 py-3">
                    {log.details && Object.keys(log.details).length > 0 ? (
                      <div className="text-xs text-neutral-400">
                        {Object.entries(log.details).slice(0, 2).map(([key, value]) => (
                          <div key={key} className="truncate max-w-xs">
                            <span className="text-neutral-500">{key}:</span> {JSON.stringify(value)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-600">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-400">
                    {formatDuration(log.duration_ms)}
                  </td>
                  <td className="px-4 py-3">
                    {log.success ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-400">
                        <i className="fa-solid fa-circle-check"></i>
                        Success
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-red-400" title={log.error_msg}>
                        <i className="fa-solid fa-circle-xmark"></i>
                        Failed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {logs.length === 0 && (
            <div className="text-center py-12 text-neutral-500">
              No audit logs found
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
