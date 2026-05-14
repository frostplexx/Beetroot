import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../common/Header'

export function OrphanedFilesTool() {
  const navigate = useNavigate()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedFiles, setSelectedFiles] = useState(new Set())

  useEffect(() => {
    loadOrphanedFiles()
  }, [])

  const loadOrphanedFiles = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/beets/tools/orphaned-files')
      const data = await response.json()
      setFiles(data.files || [])
    } catch (err) {
      console.error('Error loading orphaned files:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleFile = (path) => {
    const newSelected = new Set(selectedFiles)
    if (newSelected.has(path)) {
      newSelected.delete(path)
    } else {
      newSelected.add(path)
    }
    setSelectedFiles(newSelected)
  }

  const toggleAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set())
    } else {
      setSelectedFiles(new Set(files.map(f => f.path)))
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  const selectedSize = files
    .filter(f => selectedFiles.has(f.path))
    .reduce((sum, file) => sum + file.size, 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950">
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-rose-500 border-r-transparent"></div>
            <p className="mt-4 text-neutral-500 text-sm">Scanning for orphaned files...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <button
          onClick={() => navigate('/tools')}
          className="mb-6 text-sm text-neutral-500 hover:text-neutral-300 flex items-center gap-2"
        >
          <i className="fa-solid fa-arrow-left"></i>
          Back to Tools
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-light text-neutral-200 mb-2">Orphaned Files</h1>
          <p className="text-sm text-neutral-400">
            {files.length === 0
              ? 'No orphaned files found - all audio files are tracked by beets'
              : `Found ${files.length} file${files.length !== 1 ? 's' : ''} (${formatFileSize(totalSize)}) not tracked by beets`}
          </p>
        </div>

        {files.length > 0 && (
          <>
            <div className="mb-4 flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded p-4">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedFiles.size === files.length}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-rose-500"
                  />
                  <span className="text-sm text-neutral-300">
                    Select All ({selectedFiles.size} selected)
                  </span>
                </label>
                {selectedFiles.size > 0 && (
                  <span className="text-xs text-neutral-500">
                    {formatFileSize(selectedSize)} selected
                  </span>
                )}
              </div>
              {selectedFiles.size > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => alert('Import functionality coming soon')}
                    className="px-4 py-2 text-sm bg-rose-500 text-white rounded hover:bg-rose-600 transition-colors"
                  >
                    <i className="fa-solid fa-file-import mr-2"></i>
                    Import Selected
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete ${selectedFiles.size} file(s)? This cannot be undone.`)) {
                        alert('Delete functionality coming soon')
                      }
                    }}
                    className="px-4 py-2 text-sm bg-neutral-800 text-neutral-300 border border-neutral-700 rounded hover:border-rose-500 hover:text-rose-400 transition-colors"
                  >
                    <i className="fa-solid fa-trash mr-2"></i>
                    Delete Selected
                  </button>
                </div>
              )}
            </div>

            <div className="border border-neutral-800 rounded overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-900 border-b border-neutral-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 w-12"></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400">File Path</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-neutral-400 w-32">Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {files.map((file) => (
                    <tr
                      key={file.path}
                      className={`hover:bg-neutral-900/50 transition-colors ${
                        selectedFiles.has(file.path) ? 'bg-rose-500/5' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file.path)}
                          onChange={() => toggleFile(file.path)}
                          className="w-4 h-4 accent-rose-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-neutral-200 font-mono">
                          {file.relative_path}
                        </div>
                        <div className="text-xs text-neutral-600 font-mono mt-0.5">
                          {file.path}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-neutral-400">
                        {formatFileSize(file.size)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="mt-8 border border-neutral-800 rounded p-4 bg-neutral-900/50">
          <h3 className="text-sm font-medium text-neutral-300 mb-2">How it works</h3>
          <ul className="text-xs text-neutral-500 space-y-1">
            <li>• Scans your music directory for audio files</li>
            <li>• Compares them against files tracked in the beets database</li>
            <li>• Lists files that exist on disk but aren't imported into beets</li>
            <li>• Useful for finding forgotten files or cleaning up after manual deletions</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
