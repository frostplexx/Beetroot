import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

export function InstallExtensionDialog({ open, onClose, onInstalled }) {
  const [tab, setTab] = useState('registry')
  const [registry, setRegistry] = useState(null)
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(null)
  const [file, setFile] = useState(null)

  useEffect(() => {
    if (open) {
      loadRegistry()
    }
  }, [open])

  const loadRegistry = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/extensions/registry')
      const data = await response.json()
      setRegistry(data)
    } catch (error) {
      console.error('Failed to load registry:', error)
    } finally {
      setLoading(false)
    }
  }

  const installFromRegistry = async (extName) => {
    setInstalling(extName)
    try {
      const response = await fetch('/api/extensions/install-from-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: extName })
      })

      if (response.ok) {
        onInstalled()
        onClose()
      } else {
        const error = await response.text()
        alert(`Installation failed: ${error}`)
      }
    } catch (error) {
      console.error('Installation failed:', error)
      alert('Installation failed')
    } finally {
      setInstalling(null)
    }
  }

  const uploadZip = async () => {
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    setInstalling('upload')
    try {
      const response = await fetch('/api/extensions/install', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        onInstalled()
        onClose()
      } else {
        const error = await response.text()
        alert(`Installation failed: ${error}`)
      }
    } catch (error) {
      console.error('Installation failed:', error)
      alert('Installation failed')
    } finally {
      setInstalling(null)
      setFile(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Install Extension</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="registry">
              <i className="fa-solid fa-download mr-2"></i>
              Registry
            </TabsTrigger>
            <TabsTrigger value="upload">
              <i className="fa-solid fa-upload mr-2"></i>
              Upload ZIP
            </TabsTrigger>
          </TabsList>

          <TabsContent value="registry" className="mt-6 space-y-4">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {registry?.extensions?.map(ext => (
                  <div
                    key={ext.id}
                    className="border border-neutral-800 rounded-lg p-4 hover:border-rose-500/50 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-neutral-200">
                            {ext.display_name || ext.name}
                          </h3>
                          <Badge variant="secondary" className="text-xs">
                            v{ext.version}
                          </Badge>
                          {ext.category && (
                            <Badge variant="outline" className="text-xs">
                              {ext.category}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-neutral-400 mb-2">
                          {ext.description}
                        </p>
                        {ext.tags && ext.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {ext.tags.map(tag => (
                              <span
                                key={tag}
                                className="text-xs text-neutral-500 bg-neutral-900 px-2 py-0.5 rounded"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => installFromRegistry(ext.name)}
                        disabled={installing !== null}
                      >
                        {installing === ext.name ? (
                          <>
                            <i className="fa-solid fa-spinner fa-spin mr-2"></i>
                            Installing...
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-download mr-2"></i>
                            Install
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}

                {!registry?.extensions || registry.extensions.length === 0 && (
                  <div className="text-center py-8 text-neutral-500">
                    No extensions available in registry
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="upload" className="mt-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Upload .spotiflac-ext file
                </label>
                <Input
                  type="file"
                  accept=".spotiflac-ext,.zip"
                  onChange={(e) => setFile(e.target.files[0])}
                  className="cursor-pointer"
                />
                {file && (
                  <p className="text-sm text-neutral-400 mt-2">
                    Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h4 className="font-medium text-neutral-200 mb-2 flex items-center">
                  <i className="fa-solid fa-circle-info text-rose-500 mr-2"></i>
                  How to create extensions
                </h4>
                <p className="text-sm text-neutral-400 mb-2">
                  Extensions are ZIP files with a manifest.json and index.js file.
                </p>
                <a
                  href="https://spotiflac.zarz.moe/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-rose-400 hover:text-rose-300 inline-flex items-center"
                >
                  View documentation
                  <i className="fa-solid fa-arrow-up-right-from-square ml-1 text-xs"></i>
                </a>
              </div>

              <Button
                onClick={uploadZip}
                disabled={!file || installing !== null}
                className="w-full"
              >
                {installing === 'upload' ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin mr-2"></i>
                    Installing...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-upload mr-2"></i>
                    Install Extension
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
