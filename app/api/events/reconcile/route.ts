import { NextRequest } from 'next/server';
import ReconcileService from '@/lib/music/repository/reconcile-service';

export const dynamic = 'force-dynamic';

/**
 * SSE endpoint for real-time reconciliation updates
 * Streams events when the music library changes
 */
export async function GET(request: NextRequest) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            // Send initial connection message
            const data = JSON.stringify({
                type: 'connected',
                timestamp: Date.now()
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            console.log('[SSE] Client connected');

            // Send current status
            const status = ReconcileService.getStatus();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'status',
                data: status
            })}\n\n`));
            console.log('[SSE] Sent initial status:', status);

            // Listen for reconcile events
            const handleReconcileEvent = (event: any) => {
                try {
                    console.log('[SSE] Broadcasting event to client:', event.type, event);
                    const data = JSON.stringify(event);
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch (error) {
                    console.error('[SSE] Error encoding event:', error);
                }
            };

            ReconcileService.on('reconcile', handleReconcileEvent);

            // Send keepalive every 30 seconds
            const keepaliveInterval = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(': keepalive\n\n'));
                } catch (error) {
                    // Connection closed, cleanup
                    clearInterval(keepaliveInterval);
                }
            }, 30000);

            // Cleanup on connection close
            request.signal.addEventListener('abort', () => {
                ReconcileService.off('reconcile', handleReconcileEvent);
                clearInterval(keepaliveInterval);
                try {
                    controller.close();
                } catch (error) {
                    // Already closed
                }
            });
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable buffering in nginx
        },
    });
}
