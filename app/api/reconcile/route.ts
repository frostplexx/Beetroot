import { NextRequest, NextResponse } from 'next/server';
import reconcileService from '@/lib/music/repository/reconcile-service';

/**
 * GET /api/reconcile - Get reconciliation service status
 */
export async function GET() {
    try {
        const status = reconcileService.getStatus();

        return NextResponse.json({
            success: true,
            status: {
                ...status,
                lastRunTimeFormatted: status.lastRunTime
                    ? new Date(status.lastRunTime).toISOString()
                    : null
            }
        });
    } catch (error) {
        console.error('Error getting reconcile status:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to get status' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/reconcile - Manually trigger reconciliation
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const action = body.action;

        if (action === 'start') {
            reconcileService.start();
            return NextResponse.json({
                success: true,
                message: 'Reconciliation service started'
            });
        } else if (action === 'stop') {
            reconcileService.stop();
            return NextResponse.json({
                success: true,
                message: 'Reconciliation service stopped'
            });
        } else if (action === 'trigger') {
            // Trigger immediate reconciliation (don't await, return immediately)
            reconcileService.triggerNow().catch(error => {
                console.error('Background reconciliation failed:', error);
            });

            return NextResponse.json({
                success: true,
                message: 'Reconciliation triggered (running in background)'
            });
        } else {
            return NextResponse.json(
                { success: false, error: 'Invalid action. Use "start", "stop", or "trigger"' },
                { status: 400 }
            );
        }
    } catch (error) {
        console.error('Error handling reconcile action:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to execute action' },
            { status: 500 }
        );
    }
}
