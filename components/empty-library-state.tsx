"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Download, Loader2, CheckCircle2, Music, AlertCircle, CheckCircle } from "lucide-react"
import { toast } from "sonner"

interface ScanResult {
    total: number
    new: number
    existing: number
    newFiles: string[]
}

interface ImportLog {
    type: 'info' | 'success' | 'warning' | 'error'
    message: string
    timestamp: number
}

export function EmptyLibraryState() {
    const [scanning, setScanning] = useState(true)
    const [importing, setImporting] = useState(false)
    const [scanResult, setScanResult] = useState<ScanResult | null>(null)
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
    const [importComplete, setImportComplete] = useState(false)
    const [importLogs, setImportLogs] = useState<ImportLog[]>([])
    const [currentFile, setCurrentFile] = useState<string>("")
    const logsEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        // Auto-scan on mount
        handleScan()
    }, [])

    useEffect(() => {
        // Auto-scroll logs to bottom
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [importLogs])

    const addLog = (type: ImportLog['type'], message: string) => {
        setImportLogs(prev => [...prev, { type, message, timestamp: Date.now() }])
    }

    const handleScan = async () => {
        setScanning(true)

        try {
            const response = await fetch('/api/import?scan=true')
            const data = await response.json()

            if (data.success) {
                setScanResult(data)
            } else {
                console.error('Scan failed:', data.error)
            }
        } catch (error) {
            console.error('Failed to scan music directory:', error)
        } finally {
            setScanning(false)
        }
    }

    const handleImport = async () => {
        if (!scanResult || scanResult.new === 0) return

        setImporting(true)
        setImportProgress({ current: 0, total: scanResult.new })
        setImportLogs([])
        addLog('info', `Starting import of ${scanResult.new} tracks...`)

        try {
            const total = scanResult.new
            let completed = 0
            const results: any[] = []
            const errors: any[] = []

            // Import tracks one by one with progress updates
            for (const filePath of scanResult.newFiles) {
                const fileName = filePath.split('/').pop() || filePath
                setCurrentFile(fileName)
                addLog('info', `Importing: ${fileName}`)

                try {
                    const response = await fetch('/api/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            filePath,
                            skipMusicBrainz: false,
                            skipLastFm: false,
                            organizeFiles: true
                        })
                    })

                    const data = await response.json()

                    if (data.success) {
                        results.push({
                            filePath,
                            trackId: data.trackId,
                            conflicts: data.conflicts
                        })
                        addLog('success', `✓ ${fileName}`)

                        if (data.conflicts > 0) {
                            addLog('warning', `  ⚠ ${data.conflicts} conflict${data.conflicts > 1 ? 's' : ''} detected`)
                        }
                    } else {
                        errors.push({
                            filePath,
                            error: data.error || 'Unknown error'
                        })
                        addLog('error', `✗ ${fileName}: ${data.error || 'Unknown error'}`)
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
                    errors.push({
                        filePath,
                        error: errorMsg
                    })
                    addLog('error', `✗ ${fileName}: ${errorMsg}`)
                }

                completed++
                setImportProgress({ current: completed, total })
            }

            setImportComplete(true)
            addLog('success', `Import complete! ${results.length} tracks imported successfully`)

            if (errors.length > 0) {
                addLog('warning', `${errors.length} tracks failed to import`)
                toast.warning(`${errors.length} tracks failed to import`)
            } else {
                toast.success(`Imported ${results.length} tracks successfully`)
            }

            // Refresh the page to show new tracks
            setTimeout(() => {
                window.location.reload()
            }, 3000)
        } catch (error) {
            toast.error('Failed to import tracks')
            console.error(error)
        } finally {
            setImporting(false)
        }
    }

    if (scanning) {
        return (
            <div className="text-center py-16">
                <div className="inline-flex p-4 rounded-full bg-white/5 mb-4">
                    <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Scanning music directory...</h3>
                <p className="text-white/60 text-sm">Looking for audio files to import</p>
            </div>
        )
    }

    if (importComplete) {
        return (
            <div className="text-center py-16">
                <div className="inline-flex p-4 rounded-full bg-green-500/10 mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Import complete!</h3>
                <p className="text-white/60 text-sm">Refreshing your library...</p>
            </div>
        )
    }

    if (!scanResult || scanResult.new === 0) {
        return (
            <div className="text-center py-16">
                <div className="inline-flex p-4 rounded-full bg-white/5 mb-4">
                    <Music className="w-8 h-8 text-white/40" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Your library is empty</h3>
                <p className="text-white/60 text-sm">
                    {scanResult ? 'No new audio files found in your music directory' : 'Add music files to get started'}
                </p>
            </div>
        )
    }

    return (
        <div className="text-center py-16 max-w-xl mx-auto">
            <div className="inline-flex p-4 rounded-full bg-white/5 mb-4">
                <Download className="w-8 h-8 text-white/40" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Your library is empty</h3>
            <p className="text-white/60 text-sm mb-6">
                But {scanResult.new.toLocaleString()} {scanResult.new === 1 ? 'file has' : 'files have'} been found. Import them now?
            </p>

            {importing ? (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-white/60">
                                Importing tracks...
                            </span>
                            <span className="font-medium text-white">
                                {importProgress.current} / {importProgress.total}
                            </span>
                        </div>
                        <Progress
                            value={(importProgress.current / importProgress.total) * 100}
                            className="h-2"
                        />
                        {currentFile && (
                            <p className="text-xs text-white/50 truncate">
                                {currentFile}
                            </p>
                        )}
                    </div>

                    {/* Import logs */}
                    {importLogs.length > 0 && (
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3 max-h-64 overflow-y-auto">
                            <div className="space-y-1 font-mono text-xs">
                                {importLogs.map((log, i) => (
                                    <div
                                        key={i}
                                        className={`flex items-start gap-2 ${
                                            log.type === 'success' ? 'text-green-400' :
                                            log.type === 'warning' ? 'text-yellow-400' :
                                            log.type === 'error' ? 'text-red-400' :
                                            'text-white/60'
                                        }`}
                                    >
                                        {log.type === 'success' && <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                                        {log.type === 'warning' && <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                                        {log.type === 'error' && <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                                        <span className="break-all">{log.message}</span>
                                    </div>
                                ))}
                                <div ref={logsEndRef} />
                            </div>
                        </div>
                    )}

                    <Button
                        disabled
                        size="lg"
                        className="min-w-[200px]"
                    >
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Importing {importProgress.current} of {importProgress.total}...
                    </Button>
                </div>
            ) : (
                <Button
                    onClick={handleImport}
                    size="lg"
                    className="min-w-[200px]"
                >
                    <Download className="mr-2 h-4 w-4" />
                    Import {scanResult.new} {scanResult.new === 1 ? 'Track' : 'Tracks'}
                </Button>
            )}
        </div>
    )
}
