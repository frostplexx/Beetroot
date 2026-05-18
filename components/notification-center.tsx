"use client"

import { useState, useEffect } from "react"
import { RefreshCw, Music, AlertCircle, CheckCircle2, FileQuestion, Trash2, Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

interface ReconcileStatus {
    needsSync: number
    newFiles: number
    missingFiles: number
    totalMissing?: number
}

interface ReconcileResult {
    scanned: number
    imported: number
    missing: number
    errors: string[]
}

interface MissingFile {
    id: number
    path: string
    title: string | null
    artist: string | null
    album: string | null
    missingSince: number
}

export function NotificationCenter() {
    const [open, setOpen] = useState(false)
    const [status, setStatus] = useState<ReconcileStatus | null>(null)
    const [reconciling, setReconciling] = useState(false)
    const [result, setResult] = useState<ReconcileResult | null>(null)
    const [progress, setProgress] = useState(0)
    const [forgetting, setForgetting] = useState(false)
    const [missingFiles, setMissingFiles] = useState<MissingFile[]>([])
    const [loadingMissing, setLoadingMissing] = useState(false)

    useEffect(() => {
        // Check status on mount
        checkStatus()

        // Only auto-reconcile once per session
        const hasAutoReconciled = sessionStorage.getItem('has-auto-reconciled')
        if (!hasAutoReconciled) {
            setTimeout(() => {
                checkStatus().then(s => {
                    if (s && s.needsSync > 0) {
                        sessionStorage.setItem('has-auto-reconciled', 'true')
                        handleReconcile()
                    }
                })
            }, 2000)
        }

        // Poll for status every 30 seconds
        const interval = setInterval(checkStatus, 30000)
        return () => clearInterval(interval)
    }, [])

    const checkStatus = async () => {
        try {
            const response = await fetch('/api/reconcile?status=true')
            const data = await response.json()
            setStatus(data)

            // Fetch missing files if there are any
            if (data.totalMissing && data.totalMissing > 0) {
                fetchMissingFiles()
            } else {
                setMissingFiles([])
            }

            return data
        } catch (error) {
            console.error('Failed to check reconcile status:', error)
            return null
        }
    }

    const fetchMissingFiles = async () => {
        setLoadingMissing(true)
        try {
            const response = await fetch('/api/missing-files')
            const data = await response.json()
            if (data.success) {
                setMissingFiles(data.files)
            }
        } catch (error) {
            console.error('Failed to fetch missing files:', error)
        } finally {
            setLoadingMissing(false)
        }
    }

    const handleReconcile = async () => {
        setReconciling(true)
        setProgress(0)
        setResult(null)

        try {
            toast.info('Reconciling library...')

            const response = await fetch('/api/reconcile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            })

            const data = await response.json()

            if (data.success) {
                setResult(data)
                toast.success(`Reconciled: ${data.imported} imported, ${data.missing} missing`)

                if (data.errors.length > 0) {
                    toast.warning(`${data.errors.length} errors occurred`)
                }

                // Refresh status and page
                await checkStatus()
                setTimeout(() => {
                    window.location.reload()
                }, 2000)
            } else {
                toast.error(data.error || 'Reconcile failed')
            }
        } catch (error) {
            toast.error('Failed to reconcile library')
            console.error('Reconcile error:', error)
        } finally {
            setReconciling(false)
        }
    }

    const handleForgetMissing = async () => {
        if (!confirm('Remove all missing files from the database? This cannot be undone.')) {
            return
        }

        setForgetting(true)

        try {
            toast.info('Removing missing files...')

            const response = await fetch('/api/reconcile', {
                method: 'DELETE'
            })

            const data = await response.json()

            if (data.success) {
                const message = data.deletedAlbums > 0
                    ? `Removed ${data.deleted} tracks and ${data.deletedAlbums} albums`
                    : `Removed ${data.deleted} missing tracks`
                toast.success(message)

                // Refresh status and page
                await checkStatus()
                setTimeout(() => {
                    window.location.reload()
                }, 1000)
            } else {
                toast.error(data.error || 'Failed to remove missing files')
            }
        } catch (error) {
            toast.error('Failed to remove missing files')
            console.error('Forget missing error:', error)
        } finally {
            setForgetting(false)
        }
    }

    const needsSync = status?.needsSync || 0
    const hasNotifications = needsSync > 0 || (status?.totalMissing && status.totalMissing > 0) || (result?.errors && result.errors.length > 0)

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="relative p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10"
                >
                    <Bell className="h-5 w-5" />
                    {hasNotifications && (
                        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                            {needsSync > 99 ? '99+' : needsSync || '!'}
                        </span>
                    )}
                </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <Bell className="h-5 w-5" />
                        Notification Center
                    </SheetTitle>
                    <SheetDescription>
                        Library status, reconcile, and notifications
                    </SheetDescription>
                </SheetHeader>

                <ScrollArea className="h-[calc(100vh-120px)] mt-6" style={{ scrollbarGutter: 'stable' }}>
                    <div className="space-y-6">
                        {/* Library Status Section */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-sm">Library Status</h3>
                                {reconciling && (
                                    <Badge variant="secondary" className="gap-1">
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                        Reconciling
                                    </Badge>
                                )}
                            </div>

                            {status && (
                                <div className="rounded-lg border bg-card p-4 space-y-3">
                                    {needsSync > 0 ? (
                                        <>
                                            <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                                                <AlertCircle className="h-5 w-5" />
                                                <span className="font-medium">Library needs sync</span>
                                            </div>

                                            <Separator />

                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-muted-foreground">New files found:</span>
                                                    <Badge variant="default">{status.newFiles}</Badge>
                                                </div>
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-muted-foreground">Missing from disk:</span>
                                                    <Badge variant="destructive">{status.missingFiles}</Badge>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                                                <CheckCircle2 className="h-5 w-5" />
                                                <span className="font-medium">Library is in sync</span>
                                            </div>

                                            {status.totalMissing && status.totalMissing > 0 && (
                                                <>
                                                    <Separator />
                                                    <div className="flex items-center justify-between text-sm">
                                                        <span className="text-muted-foreground flex items-center gap-2">
                                                            <FileQuestion className="h-4 w-4" />
                                                            Total missing files:
                                                        </span>
                                                        <Badge variant="outline">{status.totalMissing}</Badge>
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Reconcile Progress */}
                            {reconciling && (
                                <div className="rounded-lg border bg-card p-4 space-y-3">
                                    <Progress value={progress} className="h-2" />
                                    <p className="text-sm text-muted-foreground">
                                        Scanning and importing files...
                                    </p>
                                </div>
                            )}

                            {/* Reconcile Result */}
                            {result && !reconciling && (
                                <div className="rounded-lg border bg-card p-4 space-y-3">
                                    <div className="flex items-center gap-2 text-sm font-medium">
                                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                        Reconcile Complete
                                    </div>

                                    <Separator />

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Files scanned:</span>
                                            <span className="font-medium">{result.scanned}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Imported:</span>
                                            <span className="font-medium text-green-600 dark:text-green-400">
                                                {result.imported}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Missing:</span>
                                            <span className="font-medium text-yellow-600 dark:text-yellow-400">
                                                {result.missing}
                                            </span>
                                        </div>
                                        {result.errors.length > 0 && (
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">Errors:</span>
                                                <span className="font-medium text-red-600 dark:text-red-400">
                                                    {result.errors.length}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="space-y-2">
                                {needsSync > 0 && !reconciling && (
                                    <Button
                                        onClick={handleReconcile}
                                        className="w-full"
                                        size="default"
                                    >
                                        <RefreshCw className="h-4 w-4 mr-2" />
                                        Reconcile Library
                                    </Button>
                                )}

                                {status?.totalMissing && status.totalMissing > 0 && !reconciling && (
                                    <Button
                                        onClick={handleForgetMissing}
                                        variant="outline"
                                        className="w-full"
                                        size="default"
                                        disabled={forgetting}
                                    >
                                        {forgetting ? (
                                            <>
                                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                                Removing...
                                            </>
                                        ) : (
                                            <>
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Forget {status.totalMissing} Missing Files
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Missing Files Section */}
                        {missingFiles.length > 0 && (
                            <>
                                <Separator />
                                <div className="space-y-3">
                                    <h3 className="font-semibold text-sm flex items-center gap-2">
                                        <FileQuestion className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                                        Missing Files ({missingFiles.length})
                                    </h3>
                                    <div className="space-y-2">
                                        {missingFiles.map((file) => (
                                            <div
                                                key={file.id}
                                                className="rounded-lg border bg-card p-3 space-y-2 hover:bg-accent/50 transition-colors"
                                            >
                                                {/* Track Info */}
                                                <div className="space-y-1">
                                                    {file.title && (
                                                        <div className="font-medium text-sm line-clamp-1">
                                                            {file.title}
                                                        </div>
                                                    )}
                                                    {file.artist && (
                                                        <div className="text-xs text-muted-foreground line-clamp-1">
                                                            {file.artist}
                                                            {file.album && ` • ${file.album}`}
                                                        </div>
                                                    )}
                                                </div>

                                                <Separator />

                                                {/* File Path */}
                                                <div className="space-y-1">
                                                    <div className="text-xs text-muted-foreground">File path:</div>
                                                    <div className="text-xs font-mono bg-muted/50 p-2 rounded break-all">
                                                        {file.path}
                                                    </div>
                                                </div>

                                                {/* Missing Since */}
                                                <div className="text-xs text-muted-foreground">
                                                    Missing since: {new Date(file.missingSince).toLocaleString()}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Errors Section */}
                        {result?.errors && result.errors.length > 0 && (
                            <>
                                <Separator />
                                <div className="space-y-3">
                                    <h3 className="font-semibold text-sm flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                        Import Errors ({result.errors.length})
                                    </h3>
                                    <div className="space-y-2">
                                        {result.errors.slice(0, 5).map((error, i) => (
                                            <div
                                                key={i}
                                                className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3"
                                            >
                                                <p className="text-xs text-red-900 dark:text-red-200 font-mono break-all">
                                                    {error}
                                                </p>
                                            </div>
                                        ))}
                                        {result.errors.length > 5 && (
                                            <p className="text-xs text-muted-foreground text-center">
                                                and {result.errors.length - 5} more errors...
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* No Notifications State */}
                        {!hasNotifications && !reconciling && !result && (
                            <div className="text-center py-12">
                                <Music className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                                <p className="text-sm text-muted-foreground">
                                    No notifications
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Your library is all caught up
                                </p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    )
}
