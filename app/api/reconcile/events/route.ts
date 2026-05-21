import { NextRequest } from 'next/server'
import reconcileService, { type ReconcileEvent } from '@/lib/music/repository/reconcile-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const KEEPALIVE_MS = 25_000

/**
 * GET /api/reconcile/events
 * SSE stream of reconcile lifecycle events. Browsers subscribe via
 * EventSource and react to `completed` events to refresh the UI.
 */
export async function GET(request: NextRequest) {
    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let closed = false

            const send = (payload: unknown) => {
                if (closed) return
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
                } catch {
                    closed = true
                }
            }

            // Replay the last completed reconcile (if any) so a fresh client
            // doesn't have to wait for the next cycle to know the current state.
            const { lastResult } = reconcileService.getStatus()
            if (lastResult) {
                send({ type: 'completed', data: lastResult })
            }

            const handler = (event: ReconcileEvent) => send(event)
            reconcileService.on('reconcile', handler)

            const keepalive = setInterval(() => {
                if (closed) return
                try {
                    controller.enqueue(encoder.encode(': keepalive\n\n'))
                } catch {
                    closed = true
                }
            }, KEEPALIVE_MS)

            const teardown = () => {
                if (closed) return
                closed = true
                clearInterval(keepalive)
                reconcileService.off('reconcile', handler)
                try {
                    controller.close()
                } catch {
                    /* already closed */
                }
            }

            request.signal.addEventListener('abort', teardown)
        },
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    })
}
