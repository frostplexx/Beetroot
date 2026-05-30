import { useEffect, useRef, useState } from 'react';

export interface SyncLogEntry {
    id: number;
    timestamp: number;
    type: 'started' | 'progress' | 'completed' | 'error';
    message: string;
    isActive: boolean;
}

export interface LibrarySyncState {
    isConnected: boolean;
    isReconciling: boolean;
    log: SyncLogEntry[];
}

let logIdCounter = 0;

function mkEntry(type: SyncLogEntry['type'], message: string, isActive = false): SyncLogEntry {
    return { id: logIdCounter++, timestamp: Date.now(), type, message, isActive };
}

function progressMessage(data: any): string {
    const phase = data?.phase ?? 'scanning';
    const scanned = data?.scannedFiles ?? 0;
    const imported = data?.newFilesImported ?? 0;
    switch (phase) {
        case 'scanning':  return `Scanning… ${scanned.toLocaleString()} files found`;
        case 'importing': return `Importing… ${imported.toLocaleString()} albums added`;
        case 'fixing-artwork': return `Fixing artwork… ${(data?.artworkFixed ?? 0).toLocaleString()} fixed`;
        case 'cleanup':   return 'Cleaning up…';
        default:          return 'Processing…';
    }
}

export function useLibrarySync(onUpdate?: () => void): LibrarySyncState {
    const [state, setState] = useState<LibrarySyncState>({
        isConnected: false,
        isReconciling: false,
        log: [],
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

                            if (data.type === 'started') {
                                isReconciling = true;
                                log = [
                                    ...log.map(e => ({ ...e, isActive: false })),
                                    mkEntry('started', 'Scan started'),
                                    mkEntry('progress', 'Initializing…', true),
                                ].slice(-50);
                            } else if (data.type === 'progress') {
                                isReconciling = true;
                                const msg = progressMessage(data.data);
                                if (log.some(e => e.isActive)) {
                                    log = log.map(e => e.isActive ? { ...e, message: msg, timestamp: Date.now() } : e);
                                } else {
                                    log = [...log, mkEntry('progress', msg, true)].slice(-50);
                                }
                            } else if (data.type === 'completed') {
                                isReconciling = false;
                                const d = data.data ?? {};
                                const parts: string[] = [];
                                if (d.newFilesImported > 0) parts.push(`${d.newFilesImported} imported`);
                                if (d.deletedItems > 0) parts.push(`${d.deletedItems} removed`);
                                if (d.artworkFixed > 0) parts.push(`${d.artworkFixed} artwork fixed`);
                                if (d.errors > 0) parts.push(`${d.errors} errors`);
                                const summary = parts.length > 0 ? parts.join(', ') : 'No changes';
                                log = [
                                    ...log.filter(e => !e.isActive),
                                    mkEntry('completed', `Scan complete — ${summary}`),
                                ].slice(-50);
                            } else if (data.type === 'error') {
                                isReconciling = false;
                                const msg = data.data?.error ?? 'Unknown error';
                                log = [
                                    ...log.filter(e => !e.isActive),
                                    mkEntry('error', msg),
                                ].slice(-50);
                            } else if (data.type === 'status') {
                                isReconciling = data.data?.isReconciling ?? prev.isReconciling;
                                if (isReconciling && !log.some(e => e.isActive)) {
                                    log = [...log, mkEntry('progress', 'Scan in progress…', true)].slice(-50);
                                }
                            }

                            return { ...prev, isReconciling, log };
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
