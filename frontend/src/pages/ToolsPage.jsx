import { useState, useEffect } from 'react'
import { useNavigate, Route, Routes } from 'react-router-dom'
import { DuplicatesTool } from '../components/tools/DuplicatesTool'
import { MissingArtTool } from '../components/tools/MissingArtTool'
import { FetchLyricsTool } from '../components/tools/FetchLyricsTool'
import { ReplayGainTool } from '../components/tools/ReplayGainTool'
import { OrphanedFilesTool } from '../components/tools/OrphanedFilesTool'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

export function ToolsPage() {
  return (
    <Routes>
      <Route index element={<ToolsGallery />} />
      <Route path="duplicates" element={<DuplicatesTool />} />
      <Route path="missing-art" element={<MissingArtTool />} />
      <Route path="lyrics" element={<FetchLyricsTool />} />
      <Route path="replaygain" element={<ReplayGainTool />} />
      <Route path="orphaned-files" element={<OrphanedFilesTool />} />
    </Routes>
  )
}

function ToolsGallery() {
  const navigate = useNavigate()
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/beets/config')
      .then(res => res.json())
      .then(data => {
        if (data.is_valid !== false) {
          setConfig(data.config)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const tools = [
    {
      id: 'duplicates',
      name: 'Find Duplicates',
      description: 'Find and merge duplicate albums across different editions',
      icon: 'fa-clone',
      plugin: 'duplicates',
      path: '/tools/duplicates'
    },
    {
      id: 'missing-art',
      name: 'Missing Album Art',
      description: 'Find albums without cover art',
      icon: 'fa-image',
      plugin: 'fetchart',
      path: '/tools/missing-art'
    },
    {
      id: 'orphaned-files',
      name: 'Orphaned Files',
      description: 'Find audio files in your music directory not tracked by beets',
      icon: 'fa-file-circle-question',
      plugin: null,
      path: '/tools/orphaned-files'
    },
    {
      id: 'lyrics',
      name: 'Fetch Lyrics',
      description: 'Download and embed lyrics for songs in your library',
      icon: 'fa-file-lines',
      plugin: 'lyrics',
      path: '/tools/lyrics'
    },
    {
      id: 'replaygain',
      name: 'ReplayGain',
      description: 'Calculate and apply ReplayGain tags for volume normalization',
      icon: 'fa-volume-high',
      plugin: 'replaygain',
      path: '/tools/replaygain'
    }
  ]

  const isPluginAvailable = (pluginName) => {
    if (!pluginName) return true
    if (!config || !config.plugins) return false
    const pluginsStr = config.plugins.replace(/[\[\]]/g, '').trim()
    const plugins = pluginsStr.split(/\s+/).filter(p => p)
    return plugins.includes(pluginName)
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-light text-neutral-200 mb-2">Tools</h1>
          <p className="text-sm text-neutral-400">
            Manage and organize your music library with these beets-powered tools
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool) => {
            const available = isPluginAvailable(tool.plugin)
            return (
              <button
                key={tool.id}
                onClick={() => available && navigate(tool.path)}
                disabled={!available}
                className={`text-left p-6 border rounded-lg transition-all ${
                  available
                    ? 'bg-neutral-900 border-neutral-800 hover:border-rose-500 cursor-pointer'
                    : 'bg-neutral-900/50 border-neutral-900 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <i className={`fa-solid ${tool.icon} text-3xl ${available ? 'text-rose-500' : 'text-neutral-700'}`}></i>
                  {!available && (
                    <Badge variant="outline" className="text-neutral-500 border-neutral-700">
                      Plugin Required
                    </Badge>
                  )}
                </div>
                <h3 className="text-lg font-medium text-neutral-200 mb-2">{tool.name}</h3>
                <p className="text-sm text-neutral-400 mb-3">{tool.description}</p>
                {tool.plugin && (
                  <div className="text-xs text-neutral-600">
                    Requires: <code className="text-neutral-500">{tool.plugin}</code> plugin
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
  )
}
