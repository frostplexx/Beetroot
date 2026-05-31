import { useEffect, useRef, useState } from 'react';

export type ReconcilePhase =
    | 'starting'
    | 'scanning'
    | 'detecting-missing'
    | 'duplicate-check'
    | 'tag-read'
    | 'clustering'
    | 'cluster-import'
    | 'tag-failed-import'
    | 'retry'
    | 'fixing-artwork'
    | 'cleanup'
    | 'finalizing';

export interface SyncLogEntry {
    id: number;
    timestamp: number;
    type: 'started' | 'progress' | 'completed' | 'error';
    phase?: ReconcilePhase;
    message: string;
    isActive: boolean;
}

export interface ReconcileProgressState {
    phase: ReconcilePhase;
    message: string;
    currentPath?: string;
    processed?: number;
    total?: number;
    scannedFiles?: number;
    newFilesImported?: number;
    missingFilesDetected?: number;
    artworkFixed?: number;
    deletedItems?: number;
    errorCount?: number;
}

// Counters captured after a completed run, used to keep the stats grid populated
// when no reconcile is currently running.
export interface ReconcileLastResult {
    scannedFiles: number;
    newFilesImported: number;
    missingFilesDetected: number;
    artworkFixed: number;
    deletedItems: number;
    errorCount: number;
    completedAt: number;
}

export interface ReconcileItemError {
    id: number;
    path: string;
    phase: ReconcilePhase;
    error: string;
    timestamp: number;
}

export interface LibrarySyncState {
    isConnected: boolean;
    isReconciling: boolean;
    log: SyncLogEntry[];
    progress: ReconcileProgressState | null;
    lastResult: ReconcileLastResult | null;
    itemErrors: ReconcileItemError[];
}

let logIdCounter = 0;
let errorIdCounter = 0;

function mkEntry(
    type: SyncLogEntry['type'],
    message: string,
    opts: { isActive?: boolean; phase?: ReconcilePhase } = {},
): SyncLogEntry {
    return {
        id: logIdCounter++,
        timestamp: Date.now(),
        type,
        phase: opts.phase,
        message,
        isActive: opts.isActive ?? false,
    };
}

const PHASE_LABELS: Record<ReconcilePhase, string> = {
    'starting': 'Starting',
    'scanning': 'Scanning files',
    'detecting-missing': 'Detecting missing',
    'duplicate-check': 'Checking duplicates',
    'tag-read': 'Reading tags',
    'clustering': 'Clustering',
    'cluster-import': 'Importing',
    'tag-failed-import': 'Importing untagged',
    'retry': 'Retrying failures',
    'fixing-artwork': 'Fetching artwork',
    'cleanup': 'Cleaning up trash',
    'finalizing': 'Finalizing',
};

function extractLastResult(d: any): ReconcileLastResult | null {
    if (!d) return null;
    if (
        d.scannedFiles == null &&
        d.newFilesImported == null &&
        d.missingFilesDetected == null
    ) {
        return null;
    }
    return {
        scannedFiles: d.scannedFiles ?? 0,
        newFilesImported: d.newFilesImported ?? 0,
        missingFilesDetected: d.missingFilesDetected ?? 0,
        artworkFixed: d.artworkFixed ?? 0,
        deletedItems: d.deletedItems ?? 0,
        errorCount: typeof d.errors === 'number' ? d.errors : Array.isArray(d.errors) ? d.errors.length : 0,
        completedAt: d.timestamp ?? Date.now(),
    };
}

export function useLibrarySync(onUpdate?: () => void): LibrarySyncState {
    const [state, setState] = useState<LibrarySyncState>({
        isConnected: false,
        isReconciling: false,
        log: [],
        progress: null,
        lastResult: null,
        itemErrors: [],
    });

    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const onUpdateRef = useRef(onUpdate);

    useEffect(() => {
        onUpdateRef.current = onUpdate;
    }, [onUpdate]);

    useEffect(() => {
        let mounted = true;

        const connect = () => {
            if (!mounted) return;

            try {
                const eventSource = new EventSource('/api/events/reconcile');
                eventSourceRef.current = eventSource;

                eventSource.onopen = () => {
                    if (!mounted) return;
                    setState(prev => ({ ...prev, isConnected: true }));
                };

                eventSource.onmessage = (event) => {
                    if (!mounted) return;

                    try {
                        const data: { type: string; data?: any } = JSON.parse(event.data);

                        setState(prev => {
                            let log = prev.log;
                            let isReconciling = prev.isReconciling;
                            let progress = prev.progress;
                            let itemErrors = prev.itemErrors;
                            let lastResult = prev.lastResult;

                            if (data.type === 'started') {
                                isReconciling = true;
                                itemErrors = [];
                                progress = {
                                    phase: 'starting',
                                    message: 'Starting reconcile',
                                };
                                log = [
                                    ...log.map(e => ({ ...e, isActive: false })),
                                    mkEntry('started', 'Reconcile started'),
                                ].slice(-100);

                            } else if (data.type === 'progress') {
                                isReconciling = true;
                                const d = data.data ?? {};
                                const phase: ReconcilePhase = d.phase ?? prev.progress?.phase ?? 'starting';
                                progress = {
                                    phase,
                                    message: d.message ?? prev.progress?.message ?? '',
                                    currentPath: d.currentPath ?? prev.progress?.currentPath,
                                    processed: d.processed ?? undefined,
                                    total: d.total ?? undefined,
                                    scannedFiles: d.scannedFiles,
                                    newFilesImported: d.newFilesImported,
                                    missingFilesDetected: d.missingFilesDetected,
                                    artworkFixed: d.artworkFixed,
                                    deletedItems: d.deletedItems,
                                    errorCount: Array.isArray(d.errors) ? d.errors.length : undefined,
                                };

                                // Activity log gets one entry per phase transition.
                                // Within a phase, the inline Activity row carries the
                                // live message, so we don't append (which is what
                                // produced the spammy "Reading local tags (40 of 92)"
                                // (50 of 92) (60 of 92)… stream).
                                const lastEntry = log[log.length - 1];
                                const samePhase =
                                    lastEntry?.isActive && lastEntry.phase === phase;

                                if (!samePhase) {
                                    log = [
                                        ...log.map(e => ({ ...e, isActive: false })),
                                        mkEntry('progress', PHASE_LABELS[phase], {
                                            isActive: true,
                                            phase,
                                        }),
                                    ].slice(-100);
                                }

                            } else if (data.type === 'item-error') {
                                const e = data.data ?? {};
                                itemErrors = [
                                    {
                                        id: errorIdCounter++,
                                        path: e.path ?? '',
                                        phase: e.phase ?? 'cluster-import',
                                        error: e.error ?? 'Unknown error',
                                        timestamp: e.timestamp ?? Date.now(),
                                    },
                                    ...itemErrors,
                                ].slice(0, 50);

                            } else if (data.type === 'completed') {
                                isReconciling = false;
                                progress = null;
                                const d = data.data ?? {};
                                lastResult = extractLastResult(d) ?? lastResult;
                                const parts: string[] = [];
                                if (d.newFilesImported > 0) parts.push(`${d.newFilesImported} imported`);
                                if (d.deletedItems > 0) parts.push(`${d.deletedItems} removed`);
                                if (d.artworkFixed > 0) parts.push(`${d.artworkFixed} artwork fixed`);
                                if (d.errors > 0) parts.push(`${d.errors} errors`);
                                const summary = parts.length > 0 ? parts.join(', ') : 'no changes';
                                log = [
                                    ...log.map(e => ({ ...e, isActive: false })),
                                    mkEntry('completed', `Reconcile complete (${summary})`),
                                ].slice(-100);

                            } else if (data.type === 'error') {
                                isReconciling = false;
                                progress = null;
                                const msg = data.data?.error ?? 'Unknown error';
                                log = [
                                    ...log.map(e => ({ ...e, isActive: false })),
                                    mkEntry('error', msg),
                                ].slice(-100);

                            } else if (data.type === 'status') {
                                isReconciling = data.data?.isReconciling ?? prev.isReconciling;
                                const lr = extractLastResult(data.data?.lastResult);
                                if (lr) lastResult = lr;
                                if (isReconciling && !log.some(e => e.isActive) && !progress) {
                                    progress = { phase: 'starting', message: 'Reconcile already in progress' };
                                    log = [
                                        ...log,
                                        mkEntry('progress', PHASE_LABELS['starting'], {
                                            isActive: true,
                                            phase: 'starting',
                                        }),
                                    ].slice(-100);
                                }
                            }

                            return { ...prev, isReconciling, log, progress, itemErrors, lastResult };
                        });

                        if (data.type === 'completed' && data.data?.hasChanges) {
                            onUpdateRef.current?.();
                        }
                    } catch (error) {
                        console.error('[LibrarySync] Error parsing event:', error);
                    }
                };

                eventSource.onerror = () => {
                    if (!mounted) return;
                    setState(prev => ({ ...prev, isConnected: false }));
                    eventSource.close();
                    reconnectTimeoutRef.current = setTimeout(() => {
                        if (mounted) connect();
                    }, 5000);
                };
            } catch (error) {
                console.error('[LibrarySync] Failed to create EventSource:', error);
            }
        };

        connect();

        return () => {
            mounted = false;
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
        };
    }, []);

    return state;
}

export { PHASE_LABELS };
