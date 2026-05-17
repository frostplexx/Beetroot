"use client"

import { useState, useEffect } from "react"
import { RefreshCw, Music } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"

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

export function ReconcileStatus() {
    const [status, setStatus] = useState<ReconcileStatus | null>(null)
    const [reconciling, setReconciling] = useState(false)
    const [result, setResult] = useState<ReconcileResult | null>(null)
    const [progress, setProgress] = useState(0)
    const [forgetting, setForgetting] = useState(false)

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
            }, 2000) // Give user time to see the badge first
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
            return data
        } catch (error) {
            console.error('Failed to check reconcile status:', error)
            return null
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

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="relative"
                >
                    <RefreshCw className={`h-4 w-4 ${reconciling ? 'animate-spin' : ''}`} />
                    {needsSync > 0 && !reconciling && (
                        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                            {needsSync > 99 ? '99+' : needsSync}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h4 className="font-medium">Library Status</h4>
                            {reconciling && (
                                <span className="text-xs text-muted-foreground">Reconciling...</span>
                            )}
                        </div>

                        {status && (
                            <div className="space-y-2 text-sm">
                                {needsSync > 0 ? (
                                    <>
                                        <div className="flex items-center justify-between text-muted-foreground">
                                            <span>New files:</span>
                                            <span className="font-medium text-foreground">{status.newFiles}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-muted-foreground">
                                            <span>Missing files:</span>
                                            <span className="font-medium text-foreground">{status.missingFiles}</span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                                            <Music className="h-4 w-4" />
                                            <span>Library is in sync</span>
                                        </div>
                                        {status.totalMissing && status.totalMissing > 0 && (
                                            <div className="flex items-center justify-between text-muted-foreground text-xs">
                                                <span>{status.totalMissing} files are missing from disk</span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {reconciling && (
                        <div className="space-y-2">
                            <Progress value={progress} className="h-2" />
                            <p className="text-xs text-muted-foreground">
                                Scanning and importing files...
                            </p>
                        </div>
                    )}

                    {result && !reconciling && (
                        <div className="space-y-2 text-sm border-t pt-4">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Scanned:</span>
                                <span className="font-medium">{result.scanned}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Imported:</span>
                                <span className="font-medium text-green-600 dark:text-green-400">{result.imported}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Missing:</span>
                                <span className="font-medium text-yellow-600 dark:text-yellow-400">{result.missing}</span>
                            </div>
                            {result.errors.length > 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Errors:</span>
                                    <span className="font-medium text-red-600 dark:text-red-400">{result.errors.length}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {needsSync > 0 && !reconciling && (
                        <Button
                            onClick={handleReconcile}
                            className="w-full"
                            size="sm"
                        >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Reconcile Library
                        </Button>
                    )}

                    {status?.totalMissing && status.totalMissing > 0 && !reconciling && !forgetting && (
                        <Button
                            onClick={handleForgetMissing}
                            variant="outline"
                            className="w-full"
                            size="sm"
                        >
                            Forget {status.totalMissing} Missing Files
                        </Button>
                    )}

                    {forgetting && (
                        <Button
                            disabled
                            variant="outline"
                            className="w-full"
                            size="sm"
                        >
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Removing...
                        </Button>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
