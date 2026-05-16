import { useState, useEffect } from 'react'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { StatCard } from '../components/common/StatCard'
import { formatDurationLong } from '../utils/formatters'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ExtensionsPanel } from '../components/extensions/ExtensionsPanel'

export function SystemPage() {
  const [activeTab, setActiveTab] = useState('stats')
  const [stats, setStats] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [filter, setFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('all')
  const [systemHealth, setSystemHealth] = useState({
    database: 'checking',
    beetsConfig: 'checking',
    musicDirectory: 'checking',
    apiServer: 'checking'
  })

  // Audit log state
  const [auditLogs, setAuditLogs] = useState([])
  const [auditStats, setAuditStats] = useState(null)
  const [auditPage, setAuditPage] = useState(0)
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditFilter, setAuditFilter] = useState({ action: '', target_type: '' })
  const auditLogsPerPage = 50

  useEffect(() => {
    loadStats()
    loadLogs()
    checkSystemHealth()
    loadAuditStats()
  }, [])

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs()
    }
  }, [activeTab, auditPage, auditFilter])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      if (activeTab === 'logs') {
        loadLogs()
      }
      if (activeTab === 'health') {
        checkSystemHealth()
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [autoRefresh, activeTab])

  const loadStats = async () => {
    try {
      const res = await fetch('/api/beets/stats')
      if (!res.ok) throw new Error('Failed to load stats')
      const data = await res.json()
      setStats(data)
      setLoading(false)
    } catch (err) {
      console.error('Error loading stats:', err)
      setLoading(false)
    }
  }

  const loadLogs = async () => {
    try {
      const res = await fetch('/api/logs?limit=500')
      if (!res.ok) throw new Error('Failed to load logs')
      const data = await res.json()
      setLogs(data.logs || [])
    } catch (err) {
      console.error('Error loading logs:', err)
    }
  }

  const checkSystemHealth = async () => {
    // Check database
    try {
      const res = await fetch('/api/beets/albums?limit=1')
      setSystemHealth(prev => ({ ...prev, database: res.ok ? 'healthy' : 'error' }))
    } catch {
      setSystemHealth(prev => ({ ...prev, database: 'error' }))
    }

    // Check beets config
    try {
      const res = await fetch('/api/beets/config')
      setSystemHealth(prev => ({ ...prev, beetsConfig: res.ok ? 'healthy' : 'error' }))
    } catch {
      setSystemHealth(prev => ({ ...prev, beetsConfig: 'error' }))
    }

    // API server is healthy if we're making requests
    setSystemHealth(prev => ({ ...prev, apiServer: 'healthy' }))
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

  // Audit log functions
  const loadAuditLogs = async () => {
    try {
      const offset = auditPage * auditLogsPerPage
      const params = new URLSearchParams({
        limit: auditLogsPerPage.toString(),
        offset: offset.toString(),
      })

      if (auditFilter.action) params.append('action', auditFilter.action)
      if (auditFilter.target_type) params.append('target_type', auditFilter.target_type)

      const res = await fetch(`/api/audit/logs?${params}`)
      if (!res.ok) return

      const data = await res.json()
      setAuditLogs(data.logs || [])
      setAuditTotal(data.total || 0)
    } catch (err) {
      console.error('Failed to load audit logs:', err)
    }
  }

  const loadAuditStats = async () => {
    try {
      const res = await fetch('/api/audit/stats')
      if (res.ok) {
        const data = await res.json()
        setAuditStats(data)
      }
    } catch (err) {
      console.error('Failed to load audit stats:', err)
    }
  }

  const formatAuditTimestamp = (timestamp) => {
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
    if (levelFilter !== 'all' && log.level?.toLowerCase() !== levelFilter) {
      return false
    }
    if (filter && !log.message?.toLowerCase().includes(filter.toLowerCase())) {
      return false
    }
    return true
  })

  const getHealthIcon = (status) => {
    switch (status) {
      case 'healthy':
        return <i className="fa-solid fa-circle-check text-green-500"></i>
      case 'error':
        return <i className="fa-solid fa-circle-xmark text-red-500"></i>
      case 'checking':
        return <i className="fa-solid fa-circle-notch fa-spin text-neutral-500"></i>
      default:
        return <i className="fa-solid fa-circle text-neutral-600"></i>
    }
  }

  if (loading) {
    return <LoadingSpinner message="Loading system info..." />
  }

  return (
    <div className="mx-auto px-3 py-4 md:py-8 w-full max-w-[1800px]">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="stats">
            <i className="fa-solid fa-chart-simple mr-2"></i>
            Statistics
          </TabsTrigger>
          <TabsTrigger value="health">
            <i className="fa-solid fa-heart-pulse mr-2"></i>
            System Health
          </TabsTrigger>
          <TabsTrigger value="logs">
            <i className="fa-solid fa-file-lines mr-2"></i>
            Logs
          </TabsTrigger>
          <TabsTrigger value="audit">
            <i className="fa-solid fa-clipboard-list mr-2"></i>
            Audit
          </TabsTrigger>
          <TabsTrigger value="extensions">
            <i className="fa-solid fa-puzzle-piece mr-2"></i>
            Extensions
          </TabsTrigger>
        </TabsList>

        {/* Stats Tab */}
        <TabsContent value="stats">
          {stats && (
          <div>
            <h2 className="text-lg font-medium text-neutral-200 mb-4">Library Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              <StatCard title="Albums" value={stats.total_albums?.toLocaleString() || 0} />
              <StatCard title="Tracks" value={stats.total_items?.toLocaleString() || 0} />
              <StatCard title="Artists" value={stats.total_artists?.toLocaleString() || 0} />
              <StatCard
                title="Duration"
                value={stats.total_duration_seconds ? formatDurationLong(stats.total_duration_seconds) : '0m'}
              />
            </div>
          </div>
          )}
        </TabsContent>

        {/* System Health Tab */}
        <TabsContent value="health">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-neutral-200">System Health</h2>
              <label className="flex items-center gap-2 text-sm text-neutral-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded border-neutral-700 bg-neutral-900 text-rose-500"
                />
                Auto-refresh
              </label>
            </div>

            <div className="grid gap-3">
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getHealthIcon(systemHealth.database)}
                  <div>
                    <h3 className="text-neutral-200 font-medium">Database Connection</h3>
                    <p className="text-sm text-neutral-500">Beets SQLite database</p>
                  </div>
                </div>
                <span className={`text-sm font-medium ${
                  systemHealth.database === 'healthy' ? 'text-green-500' :
                  systemHealth.database === 'error' ? 'text-red-500' :
                  'text-neutral-500'
                }`}>
                  {systemHealth.database === 'healthy' ? 'Connected' :
                   systemHealth.database === 'error' ? 'Error' :
                   'Checking...'}
                </span>
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getHealthIcon(systemHealth.beetsConfig)}
                  <div>
                    <h3 className="text-neutral-200 font-medium">Beets Configuration</h3>
                    <p className="text-sm text-neutral-500">Config file and plugins</p>
                  </div>
                </div>
                <span className={`text-sm font-medium ${
                  systemHealth.beetsConfig === 'healthy' ? 'text-green-500' :
                  systemHealth.beetsConfig === 'error' ? 'text-red-500' :
                  'text-neutral-500'
                }`}>
                  {systemHealth.beetsConfig === 'healthy' ? 'Valid' :
                   systemHealth.beetsConfig === 'error' ? 'Error' :
                   'Checking...'}
                </span>
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getHealthIcon(systemHealth.apiServer)}
                  <div>
                    <h3 className="text-neutral-200 font-medium">API Server</h3>
                    <p className="text-sm text-neutral-500">Backend service</p>
                  </div>
                </div>
                <span className="text-sm font-medium text-green-500">Running</span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-medium text-neutral-200">Backend Logs</h2>
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
                    className="rounded border-neutral-700 bg-neutral-900 text-rose-500"
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
        </TabsContent>

        {/* Audit Tab */}
        <TabsContent value="audit">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-neutral-200">Audit Log</h2>
            </div>

            {auditStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-400 mb-1">Total Events</div>
                  <div className="text-xl font-bold text-neutral-100">{auditStats.total.toLocaleString()}</div>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-400 mb-1">Last 24 Hours</div>
                  <div className="text-xl font-bold text-rose-400">{auditStats.recent_24h.toLocaleString()}</div>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-400 mb-1">Modifications</div>
                  <div className="text-xl font-bold text-blue-400">
                    {((auditStats.action_counts?.modify_album || 0) + (auditStats.action_counts?.modify_item || 0)).toLocaleString()}
                  </div>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-400 mb-1">Commands</div>
                  <div className="text-xl font-bold text-neutral-400">{(auditStats.action_counts?.beets_command || 0).toLocaleString()}</div>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex gap-4 mb-4">
              <select
                value={auditFilter.action}
                onChange={(e) => {
                  setAuditFilter({ ...auditFilter, action: e.target.value })
                  setAuditPage(0)
                }}
                className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
              >
                <option value="">All Actions</option>
                <option value="modify_album">Modify Album</option>
                <option value="modify_item">Modify Item</option>
                <option value="refetch_metadata">Refetch Metadata</option>
                <option value="refetch_art">Refetch Art</option>
                <option value="delete_album">Delete Album</option>
                <option value="beets_command">Beets Command</option>
              </select>

              <select
                value={auditFilter.target_type}
                onChange={(e) => {
                  setAuditFilter({ ...auditFilter, target_type: e.target.value })
                  setAuditPage(0)
                }}
                className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-rose-500"
              >
                <option value="">All Types</option>
                <option value="album">Album</option>
                <option value="item">Track</option>
                <option value="system">System</option>
              </select>

              {(auditFilter.action || auditFilter.target_type) && (
                <button
                  onClick={() => {
                    setAuditFilter({ action: '', target_type: '' })
                    setAuditPage(0)
                  }}
                  className="text-xs px-3 py-2 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 transition-colors"
                >
                  <i className="fa-solid fa-xmark mr-1"></i>
                  Clear
                </button>
              )}
            </div>

            {/* Audit Logs Table */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-950 border-b border-neutral-800">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-neutral-400">Time</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-neutral-400">Action</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-neutral-400">Target</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-neutral-400">Duration</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-neutral-400">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="border-b border-neutral-800 hover:bg-neutral-800/50">
                        <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">
                          {formatAuditTimestamp(log.timestamp)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <i className={`fa-solid ${getActionIcon(log.action)} ${getActionColor(log.action)} text-xs`}></i>
                            <span className="text-xs text-neutral-200">{getActionLabel(log.action)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-xs text-neutral-200 truncate max-w-xs">{log.target_name}</div>
                        </td>
                        <td className="px-3 py-2 text-xs text-neutral-400">
                          {formatDuration(log.duration_ms)}
                        </td>
                        <td className="px-3 py-2">
                          {log.success ? (
                            <span className="text-xs text-green-400">
                              <i className="fa-solid fa-circle-check"></i>
                            </span>
                          ) : (
                            <span className="text-xs text-red-400" title={log.error_msg}>
                              <i className="fa-solid fa-circle-xmark"></i>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {auditLogs.length === 0 && (
                  <div className="text-center py-8 text-neutral-500 text-sm">
                    No audit logs found
                  </div>
                )}
              </div>
            </div>

            {/* Pagination */}
            {auditTotal > auditLogsPerPage && (
              <div className="mt-4 flex justify-center">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAuditPage(Math.max(0, auditPage - 1))}
                    disabled={auditPage === 0}
                    className="px-3 py-1 text-sm bg-neutral-900 border border-neutral-800 rounded text-neutral-300 hover:border-rose-500 disabled:opacity-50 disabled:hover:border-neutral-800"
                  >
                    <i className="fa-solid fa-chevron-left"></i>
                  </button>
                  <span className="text-sm text-neutral-400">
                    Page {auditPage + 1} of {Math.ceil(auditTotal / auditLogsPerPage)}
                  </span>
                  <button
                    onClick={() => setAuditPage(Math.min(Math.ceil(auditTotal / auditLogsPerPage) - 1, auditPage + 1))}
                    disabled={auditPage >= Math.ceil(auditTotal / auditLogsPerPage) - 1}
                    className="px-3 py-1 text-sm bg-neutral-900 border border-neutral-800 rounded text-neutral-300 hover:border-rose-500 disabled:opacity-50 disabled:hover:border-neutral-800"
                  >
                    <i className="fa-solid fa-chevron-right"></i>
                  </button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Extensions Tab */}
        <TabsContent value="extensions">
          <ExtensionsPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
