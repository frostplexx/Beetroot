import { NextResponse } from 'next/server'
import reconcileService from '@/lib/music/repository/reconcile-service'

/**
 * GET /api/reconcile — return the current reconcile status snapshot.
 * Client hooks poll this endpoint to surface live progress and detect
 * run-completion transitions.
 */
export async function GET() {
    return NextResponse.json(reconcileService.getStatus(), {
        headers: { 'Cache-Control': 'no-store' },
    })
}

/**
 * POST /api/reconcile — fire-and-forget trigger for a reconcile pass.
 * Always returns immediately; progress + completion arrive via the next
 * /api/reconcile poll.
 */
export async function POST() {
    const status = reconcileService.getStatus()
    if (status.isReconciling) {
        return NextResponse.json(
            { started: false, message: 'Reconcile already running' },
            { status: 202 },
        )
    }

    // Don't await — we want the HTTP response back to the client immediately.
    reconcileService.triggerNow().catch((err) => {
        console.error('[/api/reconcile] background reconcile failed:', err)
    })

    return NextResponse.json({ started: true })
}
