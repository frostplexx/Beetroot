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

interface ReconcileStatusResponse {
    isRunning: boolean
    isReconciling: boolean
    lastRunTime: number | null
    lastResult: ReconcileSummary | null
    progress: ReconcileProgress | null
    runStartedAt: number | null
    runCounter: number
    intervalMinutes: number
}

interface Options {
    onCompleted?: (payload: ReconcileSummary) => void
    onError?: (message: string) => void
    /** Fire onCompleted even when nothing changed. */
    fireOnNoChanges?: boolean
}

const POLL_FAST_MS = 800   // While reconciling
const POLL_IDLE_MS = 4_000 // While idle

/**
 * Polls /api/reconcile and surfaces live status. Polling beats SSE here
 * because Next.js dev streaming was flaky and dropping events.
 *
 * The hook detects state transitions (isReconciling true → false, or a new
 * runCounter while we were never observed in the running state) and fires
 * onCompleted exactly once per finished run.
 */
export function useReconcileEvents({
    onCompleted,
    onError,
    fireOnNoChanges = false,
}: Options = {}): ReconcileLiveState {
    const onCompletedRef = useRef(onCompleted)
    const onErrorRef = useRef(onError)
    onCompletedRef.current = onCompleted
    onErrorRef.current = onError

    const [state, setState] = useState<ReconcileLiveState>({
        isReconciling: false,
        progress: null,
        lastResult: null,
        lastError: null,
    })

    // Track what we've already fired callbacks for, across polls.
    const seenRunCounterRef = useRef<number | null>(null)
    const wasReconcilingRef = useRef<boolean>(false)

    useEffect(() => {
        let cancelled = false
        let timeoutId: ReturnType<typeof setTimeout> | null = null

        const poll = async () => {
            if (cancelled) return
            let status: ReconcileStatusResponse | null = null
            try {
                const res = await fetch("/api/reconcile", { cache: "no-store" })
                if (res.ok) status = await res.json()
            } catch {
                /* network blip — just try again on the next tick */
            }

            if (cancelled) return

            if (status) {
                // Detect a freshly finished run. Two cases:
                //   (a) we previously observed isReconciling=true and it's now false
                //   (b) we never observed it running, but the runCounter advanced
                if (seenRunCounterRef.current === null) {
                    seenRunCounterRef.current = status.runCounter
                }

                const finishedSinceLast =
                    (wasReconcilingRef.current && !status.isReconciling) ||
                    status.runCounter > seenRunCounterRef.current

                setState({
                    isReconciling: status.isReconciling,
                    progress: status.isReconciling ? status.progress ?? null : null,
                    lastResult: status.lastResult,
                    // Errors flow through lastResult.errors counts; we only
                    // surface a dedicated lastError if the service starts
                    // exposing one (kept null for now to avoid stale toasts).
                    lastError: null,
                })

                if (finishedSinceLast && status.lastResult) {
                    if (fireOnNoChanges || status.lastResult.hasChanges) {
                        onCompletedRef.current?.(status.lastResult)
                    }
                    if (status.lastResult.errors && status.lastResult.errors > 0) {
                        onErrorRef.current?.(`${status.lastResult.errors} error(s) during reconcile`)
                    }
                }

                seenRunCounterRef.current = status.runCounter
                wasReconcilingRef.current = status.isReconciling
            }

            if (cancelled) return
            const next = status?.isReconciling ? POLL_FAST_MS : POLL_IDLE_MS
            timeoutId = setTimeout(poll, next)
        }

        poll()

        return () => {
            cancelled = true
            if (timeoutId) clearTimeout(timeoutId)
        }
    }, [fireOnNoChanges])

    return state
}
