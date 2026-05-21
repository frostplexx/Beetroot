import { NextResponse } from 'next/server';
import ReconcileService from '@/lib/music/repository/reconcile-service';

export const dynamic = 'force-dynamic';

/**
 * Test endpoint to manually trigger a reconcile event
 * Visit /api/test-event to trigger a fake reconciliation completion
 */
export async function GET() {
    console.log('[TEST] Manually emitting test reconcile event');

    // Emit a test event
    ReconcileService.emit('reconcile', {
        type: 'completed',
        data: {
            hasChanges: true,
            duration: '0s',
            scannedFiles: 0,
            newFilesImported: 1,
            missingFilesDetected: 0,
            artworkFixed: 0,
            deletedItems: 0,
            errors: 0
        }
    });

    return NextResponse.json({
        success: true,
        message: 'Test event emitted. Check your browser console.'
    });
}
