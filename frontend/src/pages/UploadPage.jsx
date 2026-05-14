import { useState, useCallback } from 'react'
import { Header } from '../components/common/Header'

export function UploadPage() {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [uploadComplete, setUploadComplete] = useState(false)
  const [error, setError] = useState(null)

  const handleDrag = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.name.toLowerCase().endsWith('.flac')
    )

    if (droppedFiles.length === 0) {
      setError('No FLAC files found. Please drop .flac files.')
      return
    }

    setFiles(droppedFiles)
    setError(null)
    setUploadComplete(false)
  }, [])

  const handleFileInput = (e) => {
    const selectedFiles = Array.from(e.target.files).filter(
      file => file.name.toLowerCase().endsWith('.flac')
    )

    if (selectedFiles.length === 0) {
      setError('No FLAC files found. Please select .flac files.')
      return
    }

    setFiles(selectedFiles)
    setError(null)
    setUploadComplete(false)
  }

  const handleUpload = async () => {
    if (files.length === 0) return

    setUploading(true)
    setError(null)
    setProgress('Uploading files...')

    try {
      const formData = new FormData()
      files.forEach((file, index) => {
        formData.append('files', file)
      })

      const response = await fetch('/api/beets/upload', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Upload failed')
      }

      const data = await response.json()
      setUploadComplete(true)
      setProgress(`Uploaded ${files.length} file(s) successfully`)

      // Start import
      await handleImport(data.upload_path)
    } catch (err) {
      setError(err.message)
      setProgress('')
    } finally {
      setUploading(false)
    }
  }

  const handleImport = async (uploadPath) => {
    setImporting(true)
    setProgress('Importing and matching with MusicBrainz... This may take a minute or two.')

    try {
      const response = await fetch('/api/beets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: uploadPath })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Import failed')
      }

      setProgress('Import complete! Files added to your library with full metadata.')
      setFiles([])

      // Clear success message after 5 seconds
      setTimeout(() => {
        setProgress('')
        setUploadComplete(false)
      }, 5000)
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  const handleClear = () => {
    setFiles([])
    setError(null)
    setProgress('')
    setUploadComplete(false)
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-light text-neutral-200 mb-2">Upload Music</h1>
          <p className="text-sm text-neutral-400">
            Drag and drop FLAC files to import them into your beets library
          </p>
        </div>

        {/* Drop Zone */}
        <div
          className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            dragActive
              ? 'border-rose-500 bg-rose-500/5'
              : 'border-neutral-800 bg-neutral-900/30'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            multiple
            accept=".flac"
            onChange={handleFileInput}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={uploading || importing}
          />

          <div className="pointer-events-none">
            <i className="fa-solid fa-cloud-arrow-up text-4xl text-neutral-600 mb-4"></i>
            <p className="text-lg text-neutral-300 mb-2">
              {dragActive ? 'Drop files here' : 'Drag & drop FLAC files'}
            </p>
            <p className="text-sm text-neutral-500">or click to browse</p>
          </div>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="mt-6 border border-neutral-800 rounded-lg bg-neutral-900/50">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="text-sm font-medium text-neutral-300">
                {files.length} file{files.length !== 1 ? 's' : ''} ready to upload
              </h3>
              {!uploading && !importing && !uploadComplete && (
                <button
                  onClick={handleClear}
                  className="text-xs text-neutral-500 hover:text-neutral-300"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="px-4 py-2 border-b border-neutral-800 last:border-b-0 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <i className="fa-solid fa-file-audio text-neutral-600"></i>
                    <span className="text-sm text-neutral-300 truncate">{file.name}</span>
                  </div>
                  <span className="text-xs text-neutral-500 ml-4">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {files.length > 0 && !uploadComplete && (
          <div className="mt-6">
            <button
              onClick={handleUpload}
              disabled={uploading || importing}
              className="w-full px-6 py-3 bg-rose-500 text-white rounded-lg hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {uploading ? 'Uploading...' : importing ? 'Importing...' : 'Upload & Import'}
            </button>
          </div>
        )}

        {/* Progress */}
        {progress && (
          <div className={`mt-6 p-4 rounded-lg border ${
            error ? 'bg-red-950/20 border-red-900/50' : 'bg-neutral-900 border-neutral-800'
          }`}>
            <div className="flex items-start gap-3">
              {!error && (uploading || importing) && (
                <div className="w-5 h-5 border-2 border-neutral-600 border-t-rose-500 rounded-full animate-spin flex-shrink-0 mt-0.5"></div>
              )}
              {!error && uploadComplete && (
                <i className="fa-solid fa-check-circle text-green-500 flex-shrink-0 mt-0.5"></i>
              )}
              <div className="flex-1">
                <p className={`text-sm ${error ? 'text-red-400' : 'text-neutral-300'}`}>
                  {progress}
                </p>
                {importing && (
                  <p className="text-xs text-neutral-500 mt-1">
                    Beets is analyzing audio, querying MusicBrainz, and downloading album art. Please wait...
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-6 p-4 bg-red-950/20 border border-red-900/50 rounded-lg">
            <div className="flex items-start gap-3">
              <i className="fa-solid fa-exclamation-triangle text-red-500 mt-0.5"></i>
              <div>
                <p className="text-sm text-red-400 font-medium mb-1">Error</p>
                <p className="text-sm text-red-300">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="mt-8 border border-neutral-800 rounded-lg p-4 bg-neutral-900/30">
          <h3 className="text-sm font-medium text-neutral-300 mb-2">How it works</h3>
          <ul className="text-xs text-neutral-500 space-y-1">
            <li>• Drag and drop FLAC files into the upload area</li>
            <li>• Files are uploaded to a temporary directory on the server</li>
            <li>• Beets matches your music with MusicBrainz database</li>
            <li>• Album art is automatically downloaded from online sources</li>
            <li>• Full metadata (artist, album, genres, year) is applied</li>
            <li>• Files are organized and moved to your music library</li>
            <li>• Import typically takes 1-2 minutes per album</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
