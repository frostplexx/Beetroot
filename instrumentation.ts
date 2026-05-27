/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts (not on each request)
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { default: reconcileService } = await import('@/lib/music/repository/reconcile-service');
        console.log('[Instrumentation] Starting reconciliation service on server startup');
        reconcileService.start();

        // Pre-generate all album thumbnails in the background so the first
        // library page load hits disk cache instead of the sharp queue.
        const { default: db } = await import('@/lib/music/database/db');
        const { warmArtCache } = await import('@/lib/api/serve-art');
        const rows = db.prepare(
            "SELECT artpath FROM albums WHERE artpath IS NOT NULL AND missing_since IS NULL"
        ).all() as { artpath: string }[];
        warmArtCache(rows.map(r => r.artpath)).catch(() => {});
    }
}
