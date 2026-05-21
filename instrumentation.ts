/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts (not on each request)
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // Only run on Node.js runtime (server-side)
        const { default: reconcileService } = await import('@/lib/music/repository/reconcile-service');
        
        console.log('[Instrumentation] Starting reconciliation service on server startup');
        reconcileService.start();
    }
}
