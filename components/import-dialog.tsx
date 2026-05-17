"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Download, Loader2, CheckCircle2, XCircle, AlertCircle, CheckCircle } from "lucide-react"
import { toast } from "sonner"

interface ScanResult {
    total: number
    new: number
    existing: number
    newFiles: string[]
}

interface ImportResult {
    imported: number
    failed: number
    results: Array<{
        filePath: string
        trackId: number
        conflicts: number
    }>
    errors: Array<{
        filePath: string
        error: string
    }>
}

interface ImportLog {
    type: 'info' | 'success' | 'warning' | 'error'
    message: string
    timestamp: number
}

export function ImportDialog() {
    const [open, setOpen] = useState(false)
    const [scanning, setScanning] = useState(false)
    const [importing, setImporting] = useState(false)
    const [scanResult, setScanResult] = useState<ScanResult | null>(null)
    const [importResult, setImportResult] = useState<ImportResult | null>(null)
    const [skipMusicBrainz, setSkipMusicBrainz] = useState(false)
    const [skipLastFm, setSkipLastFm] = useState(true)
    const [organizeFiles, setOrganizeFiles] = useState(true)
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
    const [importLogs, setImportLogs] = useState<ImportLog[]>([])
    const [currentFile, setCurrentFile] = useState<string>("")
    const logsEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        // Auto-scroll logs to bottom
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [importLogs])

    const addLog = (type: ImportLog['type'], message: string) => {
        setImportLogs(prev => [...prev, { type, message, timestamp: Date.now() }])
    }

    const handleScan = async () => {
        setScanning(true)
        setScanResult(null)
        setImportResult(null)

        try {
            const response = await fetch('/api/import?scan=true')
            const data = await response.json()

            if (data.success) {
                setScanResult(data)
                toast.success(`Found ${data.new} new files to import`)
            } else {
                toast.error(data.error || 'Scan failed')
            }
        } catch (error) {
            toast.error('Failed to scan music directory')
            console.error(error)
        } finally {
            setScanning(false)
        }
    }

    const handleImport = async () => {
        if (!scanResult || scanResult.new === 0) return

        setImporting(true)
        setImportResult(null)
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
                            skipMusicBrainz,
                            skipLastFm,
                            organizeFiles
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

            // Set final results
            const finalResult = {
                imported: results.length,
                failed: errors.length,
                results,
                errors
            }

            setImportResult(finalResult)
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
            }, 2000)
        } catch (error) {
            toast.error('Failed to import tracks')
            console.error(error)
        } finally {
            setImporting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Import Music
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Import Music</DialogTitle>
                    <DialogDescription>
                        Scan your music directory and import new tracks
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Scan Section */}
                    <div className="space-y-4">
                        <Button
                            onClick={handleScan}
                            disabled={scanning || importing}
                            className="w-full"
                        >
                            {scanning ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Scanning...
                                </>
                            ) : (
                                'Scan Music Directory'
                            )}
                        </Button>

                        {scanResult && (
                            <div className="rounded-lg border p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Total files:</span>
                                    <span className="text-sm">{scanResult.total}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Already imported:</span>
                                    <span className="text-sm">{scanResult.existing}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-primary">New files:</span>
                                    <span className="text-sm font-semibold text-primary">{scanResult.new}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Import Options */}
                    {scanResult && scanResult.new > 0 && (
                        <div className="space-y-4">
                            <div className="space-y-3">
                                <Label>Import Options</Label>
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="skip-mb"
                                        checked={skipMusicBrainz}
                                        onCheckedChange={(checked) => setSkipMusicBrainz(checked === true)}
                                    />
                                    <label
                                        htmlFor="skip-mb"
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        Skip MusicBrainz lookup (faster, less accurate)
                                    </label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="skip-lastfm"
                                        checked={skipLastFm}
                                        onCheckedChange={(checked) => setSkipLastFm(checked === true)}
                                    />
                                    <label
                                        htmlFor="skip-lastfm"
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        Skip Last.fm genres
                                    </label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="organize-files"
                                        checked={organizeFiles}
                                        onCheckedChange={(checked) => setOrganizeFiles(checked === true)}
                                    />
                                    <label
                                        htmlFor="organize-files"
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        Organize files into folders
                                    </label>
                                </div>
                            </div>

                            {importing ? (
                                <div className="space-y-3">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">
                                                Importing tracks...
                                            </span>
                                            <span className="font-medium">
                                                {importProgress.current} / {importProgress.total}
                                            </span>
                                        </div>
                                        <Progress
                                            value={(importProgress.current / importProgress.total) * 100}
                                            className="h-2"
                                        />
                                        {currentFile && (
                                            <p className="text-xs text-muted-foreground truncate">
                                                {currentFile}
                                            </p>
                                        )}
                                    </div>

                                    {/* Import logs */}
                                    {importLogs.length > 0 && (
                                        <div className="rounded-lg border p-3 max-h-48 overflow-y-auto bg-muted/20">
                                            <div className="space-y-1 font-mono text-xs">
                                                {importLogs.map((log, i) => (
                                                    <div
                                                        key={i}
                                                        className={`flex items-start gap-2 ${
                                                            log.type === 'success' ? 'text-green-600 dark:text-green-400' :
                                                            log.type === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
                                                            log.type === 'error' ? 'text-red-600 dark:text-red-400' :
                                                            'text-muted-foreground'
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
                                        className="w-full"
                                        variant="default"
                                    >
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Importing {importProgress.current} of {importProgress.total} tracks...
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    onClick={handleImport}
                                    className="w-full"
                                    variant="default"
                                >
                                    Import {scanResult.new} New Tracks
                                </Button>
                            )}
                        </div>
                    )}

                    {/* Import Results */}
                    {importResult && (
                        <div className="space-y-4">
                            <div className="rounded-lg border p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                                    <span className="font-semibold">Import Complete</span>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm">Successfully imported:</span>
                                        <span className="text-sm font-semibold text-green-600">
                                            {importResult.imported}
                                        </span>
                                    </div>
                                    {importResult.failed > 0 && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm">Failed:</span>
                                            <span className="text-sm font-semibold text-red-600">
                                                {importResult.failed}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Show conflicts warning */}
                                {importResult.results.some(r => r.conflicts > 0) && (
                                    <div className="flex items-start gap-2 mt-3 p-3 bg-yellow-500/10 rounded-md">
                                        <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                                        <div className="text-sm text-yellow-600">
                                            Some tracks have conflicts. Check the conflicts page to resolve them.
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Show errors if any */}
                            {importResult.errors.length > 0 && (
                                <div className="rounded-lg border border-red-200 p-4 space-y-2 max-h-60 overflow-y-auto">
                                    <div className="flex items-center gap-2 mb-2">
                                        <XCircle className="h-4 w-4 text-red-500" />
                                        <span className="font-semibold text-sm">Errors</span>
                                    </div>
                                    {importResult.errors.map((error, i) => (
                                        <div key={i} className="text-xs space-y-1">
                                            <div className="font-mono text-muted-foreground truncate">
                                                {error.filePath}
                                            </div>
                                            <div className="text-red-600">{error.error}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
