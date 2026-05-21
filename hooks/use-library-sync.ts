"use client";

import { useEffect, useRef, useState } from 'react';

export interface LibrarySyncEvent {
    type: 'connected' | 'status' | 'started' | 'progress' | 'completed' | 'error';
    data?: any;
    timestamp?: number;
}

export interface LibrarySyncState {
    isConnected: boolean;
    isReconciling: boolean;
    lastUpdate: number | null;
    lastEvent: LibrarySyncEvent | null;
}

/**
 * Hook to sync with library changes via SSE
 * Automatically reconnects on disconnect
 */
export function useLibrarySync(onUpdate?: () => void) {
    const [state, setState] = useState<LibrarySyncState>({
        isConnected: false,
        isReconciling: false,
        lastUpdate: null,
        lastEvent: null
    });

    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const onUpdateRef = useRef(onUpdate);

    // Keep onUpdate callback ref fresh
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
                    console.log('[LibrarySync] Connected to event stream');
                    setState(prev => ({ ...prev, isConnected: true }));
                };

                eventSource.onmessage = (event) => {
                    if (!mounted) return;

                    try {
                        const data: LibrarySyncEvent = JSON.parse(event.data);
                        console.log('[LibrarySync] Received event:', data.type, data);

                        setState(prev => ({
                            ...prev,
                            lastEvent: data,
                            isReconciling: data.type === 'started' || data.type === 'progress',
                        }));

                        // Trigger update callback when reconciliation completes with changes
                        if (data.type === 'completed' && data.data?.hasChanges) {
                            console.log('[LibrarySync] Triggering refresh due to library changes');
                            setState(prev => ({ ...prev, lastUpdate: Date.now() }));
                            onUpdateRef.current?.();
                        }
                    } catch (error) {
                        console.error('[LibrarySync] Error parsing event:', error);
                    }
                };

                eventSource.onerror = () => {
                    if (!mounted) return;

                    console.error('[LibrarySync] Connection error, reconnecting in 5s...');
                    setState(prev => ({ ...prev, isConnected: false }));

                    eventSource.close();

                    // Reconnect after 5 seconds
                    reconnectTimeoutRef.current = setTimeout(() => {
                        if (mounted) {
                            connect();
                        }
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
