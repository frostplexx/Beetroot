"use client"

import { useEffect, useRef, useState } from "react"

export type ReconcileEventType = "started" | "progress" | "completed" | "error"

export interface ReconcileProgress {
    phase?: string
    scannedFiles?: number
    newFilesFound?: number
    newFilesImported?: number
    missingFilesDetected?: number
    artworkFixed?: number
    deletedItems?: number
    errors?: unknown[]
}

export interface ReconcileSummary {
    duration?: string
    scannedFiles?: number
    newFilesImported?: number
    missingFilesDetected?: number
    artworkFixed?: number
    deletedItems?: number
    errors?: number
    hasChanges?: boolean
    timestamp?: number
}

export interface ReconcileLiveState {
    isReconciling: boolean
    progress: ReconcileProgress | null
    lastResult: ReconcileSummary | null
    lastError: string | null
}

interface Options {
    onCompleted?: (payload: ReconcileSummary) => void
    onError?: (message: string) => void
    /** Fire onCompleted even when nothing changed. */
    fireOnNoChanges?: boolean
}

/**
 * Subscribes to real-time reconcile events via Server-Sent Events (SSE).
 * Provides live status updates and fires callbacks on completion/error.
 *
 * The hook detects completed events and fires onCompleted exactly once per
 * finished run, avoiding duplicate callbacks.
 */
export function useReconcileEvents({
    onCompleted,
    onError,
    fireOnNoChanges = false,
}: Options = {}): ReconcileLiveState {
    const onCompletedRef = useRef(onCompleted)
    const onErrorRef = useRef(onError)
    const fireOnNoChangesRef = useRef(fireOnNoChanges)

    onCompletedRef.current = onCompleted
    onErrorRef.current = onError
    fireOnNoChangesRef.current = fireOnNoChanges

    const [state, setState] = useState<ReconcileLiveState>({
        isReconciling: false,
        progress: null,
        lastResult: null,
        lastError: null,
    })

    // Track what we've already fired callbacks for to prevent duplicates
    const lastCompletedTimestampRef = useRef<number | null>(null)

    useEffect(() => {
        let eventSource: EventSource | null = null
        let reconnectTimeout: NodeJS.Timeout | null = null
        let isClosed = false

        const connect = () => {
            if (isClosed) return

            eventSource = new EventSource("/api/reconcile/events")

            eventSource.onopen = () => {
                console.log('[SSE] Connection established')
            }

            eventSource.onmessage = (event) => {
                if (isClosed) return

                try {
                    const message = JSON.parse(event.data)
                    const { type, data } = message

                    switch (type) {
                        case 'connected':
                            console.log('[SSE] Connected:', data.message)
                            break

                        case 'started':
                            setState(prev => ({
                                ...prev,
                                isReconciling: true,
                                progress: null,
                            }))
                            break

                        case 'progress':
                            setState(prev => ({
                                ...prev,
                                isReconciling: true,
                                progress: data,
                            }))
                            break

                        case 'completed':
                            setState(prev => ({
                                ...prev,
                                isReconciling: false,
                                progress: null,
                                lastResult: data,
                                lastError: null,
                            }))

                            // Fire onCompleted callback once per unique completion
                            const timestamp = data.timestamp || Date.now()
                            if (timestamp !== lastCompletedTimestampRef.current) {
                                lastCompletedTimestampRef.current = timestamp

                                if (fireOnNoChangesRef.current || data.hasChanges) {
                                    onCompletedRef.current?.(data)
                                }

                                if (data.errors && data.errors > 0) {
                                    onErrorRef.current?.(`${data.errors} error(s) during reconcile`)
                                }
                            }
                            break

                        case 'error':
                            setState(prev => ({
                                ...prev,
                                isReconciling: false,
                                progress: null,
                                lastError: data.error || 'Unknown error',
                            }))
                            onErrorRef.current?.(data.error || 'Reconciliation failed')
                            break
                    }
                } catch (err) {
                    console.error('[SSE] Error parsing message:', err)
                }
            }

            eventSource.onerror = (error) => {
                console.error('[SSE] Connection error:', error)
                eventSource?.close()

                // Reconnect after 5 seconds
                if (!isClosed) {
                    console.log('[SSE] Reconnecting in 5 seconds...')
                    reconnectTimeout = setTimeout(() => {
                        if (!isClosed) {
                            connect()
                        }
                    }, 5000)
                }
            }
        }

        connect()

        return () => {
            isClosed = true
            if (eventSource) {
                eventSource.close()
                eventSource = null
            }
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout)
            }
        }
    }, []) // Empty deps - callbacks use refs

    return state
}
