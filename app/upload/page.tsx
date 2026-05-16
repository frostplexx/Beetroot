"use client"

import { useState } from "react"
import { Upload, File, X, CheckCircle, Loader2, FolderUp } from "lucide-react"

interface UploadFile {
  id: string
  name: string
  size: number
  status: "pending" | "uploading" | "complete" | "error"
  progress: number
}

export default function UploadPage() {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    addFiles(droppedFiles)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      addFiles(selectedFiles)
    }
  }

  const addFiles = (newFiles: File[]) => {
    const uploadFiles: UploadFile[] = newFiles.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      status: "pending",
      progress: 0,
    }))

    setFiles((prev) => [...prev, ...uploadFiles])

    // Simulate upload
    uploadFiles.forEach((file) => {
      simulateUpload(file.id)
    })
  }

  const simulateUpload = (fileId: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId ? { ...f, status: "uploading" as const } : f
      )
    )

    let progress = 0
    const interval = setInterval(() => {
      progress += Math.random() * 20
      if (progress >= 100) {
        clearInterval(interval)
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? { ...f, status: "complete" as const, progress: 100 }
              : f
          )
        )
      } else {
        setFiles((prev) =>
          prev.map((f) => (f.id === fileId ? { ...f, progress } : f))
        )
      }
    }, 300)
  }

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i]
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-white mb-2">
          Upload Music
        </h1>
        <p className="text-white/60 text-sm">
          Import your music files to your library
        </p>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-12 mb-6 transition-all ${
          isDragging
            ? "border-purple-400/60 bg-gradient-to-br from-purple-500/20 to-pink-500/20"
            : "border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-pink-500/10 hover:from-purple-500/15 hover:to-pink-500/15"
        }`}
      >
        <input
          type="file"
          multiple
          accept="audio/*"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          id="file-upload"
        />
        <div className="flex flex-col items-center text-center">
          <div className="p-4 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 mb-4 ring-1 ring-purple-400/30">
            <Upload className="w-8 h-8 text-purple-300" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            Drop files here or click to browse
          </h3>
          <p className="text-sm text-purple-200/60">
            Supports MP3, FLAC, WAV, and other audio formats
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button className="flex items-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-400/20 text-blue-200 hover:from-blue-500/20 hover:to-cyan-500/20 hover:border-blue-400/40 hover:text-blue-100 transition-all">
          <FolderUp className="w-4 h-4" />
          <span className="text-sm font-medium">Import Folder</span>
        </button>
        <button className="flex items-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-400/20 text-green-200 hover:from-green-500/20 hover:to-emerald-500/20 hover:border-green-400/40 hover:text-green-100 transition-all">
          <File className="w-4 h-4" />
          <span className="text-sm font-medium">Import from URL</span>
        </button>
      </div>

      {/* Files List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              Uploading {files.filter((f) => f.status !== "complete").length} of{" "}
              {files.length} files
            </h2>
            {files.every((f) => f.status === "complete") && (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                All complete
              </div>
            )}
          </div>

          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-4 p-4 rounded-lg bg-white/5 border border-white/10"
            >
              {/* Icon */}
              <div className="flex-shrink-0">
                {file.status === "complete" ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : file.status === "uploading" ? (
                  <Loader2 className="w-5 h-5 text-white/70 animate-spin" />
                ) : (
                  <File className="w-5 h-5 text-white/70" />
                )}
              </div>

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-white truncate">
                    {file.name}
                  </p>
                  <span className="text-xs text-white/60 ml-2">
                    {formatFileSize(file.size)}
                  </span>
                </div>

                {/* Progress Bar */}
                {file.status !== "complete" && (
                  <div className="w-full bg-white/10 rounded-full h-1.5">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                )}

                {file.status === "complete" && (
                  <p className="text-xs text-emerald-400 font-medium">Upload complete ✨</p>
                )}
              </div>

              {/* Remove Button */}
              <button
                onClick={() => removeFile(file.id)}
                className="flex-shrink-0 p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all"
                aria-label="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {files.length === 0 && (
        <div className="text-center py-12">
          <p className="text-white/40 text-sm">No files selected yet</p>
        </div>
      )}
    </div>
  )
}
