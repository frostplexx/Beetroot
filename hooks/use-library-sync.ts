import { useEffect, useRef, useSyncExternalStore } from 'react';

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

export const PHASE_LABELS: Record<ReconcilePhase, string> = {
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

// ---- Module-level singleton -----------------------------------------------
// State persists across component mounts so navigating away and back doesn't
// clear the activity log and error list.

let logIdCounter = 0;
let errorIdCounter = 0;

let _state: LibrarySyncState = {
    isConnected: false,
    isReconciling: false,
    log: [],
    progress: null,
    lastResult: null,
    itemErrors: [],
};

const _subscribers = new Set<() => void>();
const _onUpdateCallbacks = new Set<() => void>();

function _notify() {
    for (const sub of _subscribers) sub();
}

function _setState(updater: (prev: LibrarySyncState) => LibrarySyncState) {
    _state = updater(_state);
    _notify();
}

function _subscribe(callback: () => void) {
    _subscribers.add(callback);
    return () => { _subscribers.delete(callback); };
}

function _getSnapshot() {
    return _state;
}

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

function extractLastResult(d: any): ReconcileLastResult | null {
    if (!d) return null;
    if (d.scannedFiles == null && d.newFilesImported == null && d.missingFilesDetected == null) {
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

let _eventSource: EventSource | null = null;
let _reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

function _connect() {
    if (typeof window === 'undefined') return;

    try {
        const es = new EventSource('/api/events/reconcile');
        _eventSource = es;

        es.onopen = () => {
            _setState(prev => ({ ...prev, isConnected: true }));
        };

        es.onmessage = (event) => {
            try {
                const data: { type: string; data?: any } = JSON.parse(event.data);

                _setState(prev => {
                    let log = prev.log;
                    let isReconciling = prev.isReconciling;
                    let progress = prev.progress;
                    let itemErrors = prev.itemErrors;
                    let lastResult = prev.lastResult;

                    if (data.type === 'started') {
                        isReconciling = true;
                        itemErrors = [];
                        progress = { phase: 'starting', message: 'Starting reconcile' };
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

                        const lastEntry = log[log.length - 1];
                        const samePhase = lastEntry?.isActive && lastEntry.phase === phase;
                        if (!samePhase) {
                            log = [
                                ...log.map(e => ({ ...e, isActive: false })),
                                mkEntry('progress', PHASE_LABELS[phase], { isActive: true, phase }),
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
                    for (const cb of _onUpdateCallbacks) cb();
                }
            } catch (error) {
                console.error('[LibrarySync] Error parsing event:', error);
            }
        };

        es.onerror = () => {
            _setState(prev => ({ ...prev, isConnected: false }));
            es.close();
            _eventSource = null;
            _reconnectTimeout = setTimeout(_connect, 5000);
        };
    } catch (error) {
        console.error('[LibrarySync] Failed to create EventSource:', error);
    }
}

// Connect once for the lifetime of the app.
if (typeof window !== 'undefined') {
    _connect();
}

// ---- Hook -----------------------------------------------------------------

export function useLibrarySync(onUpdate?: () => void): LibrarySyncState {
    const onUpdateRef = useRef(onUpdate);

    useEffect(() => {
        onUpdateRef.current = onUpdate;
    }, [onUpdate]);

    useEffect(() => {
        const cb = () => onUpdateRef.current?.();
        _onUpdateCallbacks.add(cb);
        return () => { _onUpdateCallbacks.delete(cb); };
    }, []);

    return useSyncExternalStore(_subscribe, _getSnapshot, _getSnapshot);
}
