import { useState, useEffect } from 'react'
import { Header } from '../components/common/Header'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { StatCard } from '../components/common/StatCard'
import { formatDurationLong } from '../utils/formatters'

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

  useEffect(() => {
    loadStats()
    loadLogs()
    checkSystemHealth()
  }, [])

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
    <div className="min-h-screen bg-neutral-950">
      <Header />

      <div className="mx-auto px-3 py-4 md:py-8 w-full max-w-[1800px]">
        {/* Tab Navigation */}
        <div className="mb-6 border-b border-neutral-800">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'stats'
                  ? 'border-rose-500 text-rose-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <i className="fa-solid fa-chart-simple mr-2"></i>
              Statistics
            </button>
            <button
              onClick={() => setActiveTab('health')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'health'
                  ? 'border-rose-500 text-rose-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <i className="fa-solid fa-heart-pulse mr-2"></i>
              System Health
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'logs'
                  ? 'border-rose-500 text-rose-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <i className="fa-solid fa-file-lines mr-2"></i>
              Logs
            </button>
          </div>
        </div>

        {/* Stats Tab */}
        {activeTab === 'stats' && stats && (
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

        {/* System Health Tab */}
        {activeTab === 'health' && (
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
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
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
        )}
      </div>
    </div>
  )
}
