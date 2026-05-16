import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ExtensionCard } from './ExtensionCard'
import { InstallExtensionDialog } from './InstallExtensionDialog'
import { ExtensionSettingsDialog } from './ExtensionSettingsDialog'
import { Skeleton } from '@/components/ui/skeleton'

export function ExtensionsPanel() {
  const [extensions, setExtensions] = useState([])
  const [loading, setLoading] = useState(true)
  const [installDialog, setInstallDialog] = useState(false)
  const [settingsDialog, setSettingsDialog] = useState(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => {
    loadExtensions()
  }, [refreshTrigger])

  const loadExtensions = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/extensions')
      const data = await response.json()
      setExtensions(data.extensions || [])
    } catch (error) {
      console.error('Failed to load extensions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  const handleUninstall = async (extension) => {
    if (!confirm(`Uninstall ${extension.manifest.displayName || extension.name}?`)) {
      return
    }

    try {
      const response = await fetch(`/api/extensions/${extension.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        handleRefresh()
      } else {
        const error = await response.text()
        alert(`Failed to uninstall: ${error}`)
      }
    } catch (error) {
      console.error('Failed to uninstall extension:', error)
      alert('Failed to uninstall extension')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-neutral-100">Extensions</h2>
          <p className="text-sm text-neutral-400 mt-1">
            Manage SpotiFLAC extensions for downloading music
          </p>
        </div>
        <Button onClick={() => setInstallDialog(true)}>
          <i className="fa-solid fa-plus mr-2"></i>
          Install Extension
        </Button>
      </div>

      {extensions.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-neutral-800 rounded-lg">
          <i className="fa-solid fa-puzzle-piece text-6xl text-neutral-700 mb-4"></i>
          <h3 className="text-xl font-medium text-neutral-300 mb-2">
            No extensions installed
          </h3>
          <p className="text-neutral-500 mb-6">
            Install extensions to search and download music from various sources
          </p>
          <Button onClick={() => setInstallDialog(true)}>
            <i className="fa-solid fa-download mr-2"></i>
            Browse Registry
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {extensions.map(ext => (
            <ExtensionCard
              key={ext.id}
              extension={ext}
              onSettingsClick={() => setSettingsDialog(ext)}
              onUninstall={() => handleUninstall(ext)}
              onRefresh={handleRefresh}
            />
          ))}
        </div>
      )}

      {installDialog && (
        <InstallExtensionDialog
          open={installDialog}
          onClose={() => setInstallDialog(false)}
          onInstalled={handleRefresh}
        />
      )}

      {settingsDialog && (
        <ExtensionSettingsDialog
          extension={settingsDialog}
          open={!!settingsDialog}
          onClose={() => setSettingsDialog(null)}
          onSave={handleRefresh}
        />
      )}
    </div>
  )
}
