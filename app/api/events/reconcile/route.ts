import { NextRequest } from 'next/server';
import ReconcileService from '@/lib/music/repository/reconcile-service';

export const dynamic = 'force-dynamic';

/**
 * SSE endpoint for real-time reconciliation updates
 * Streams events when the music library changes
 */
export async function GET(request: NextRequest) {
    const encoder = new TextEncoder();

    // Track cleanup state
    let cleanedUp = false;

    const stream = new ReadableStream({
        start(controller) {
            // Send initial connection message
            const data = JSON.stringify({
                type: 'connected',
                timestamp: Date.now()
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            console.debug('[SSE] Client connected');

            // Send current status
            const status = ReconcileService.getStatus();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'status',
                data: status
            })}\n\n`));

            // Listen for reconcile events
            const handleReconcileEvent = (event: any) => {
                try {
                    const data = JSON.stringify(event);
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch (error) {
                    console.error('[SSE] Send failed:', error instanceof Error ? error.message : String(error));
                    cleanup();
                }
            };

            // Cleanup function to ensure listeners are removed
            const cleanup = () => {
                if (cleanedUp) return;
                cleanedUp = true;

                ReconcileService.off('reconcile', handleReconcileEvent);
                clearInterval(keepaliveInterval);
                console.debug('[SSE] Client disconnected, cleaned up');

                try {
                    controller.close();
                } catch (error) {
                    // Already closed
                }
            };

            ReconcileService.on('reconcile', handleReconcileEvent);

            // Send keepalive every 30 seconds
            const keepaliveInterval = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(': keepalive\n\n'));
                } catch (error) {
                    // Connection closed, cleanup
                    cleanup();
                }
            }, 30000);

            // Cleanup on connection close
            request.signal.addEventListener('abort', cleanup);
        },

        cancel() {
            // Called when stream is cancelled by client
            if (!cleanedUp) {
                cleanedUp = true;
                console.debug('[SSE] Stream cancelled');
            }
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
