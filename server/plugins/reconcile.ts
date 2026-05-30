import { defineNitroPlugin } from "nitro/runtime";

// Runs once when the Nitro server starts (not per request).
// Replaces the Next.js instrumentation.ts hook.
export default defineNitroPlugin(async () => {
    const { default: reconcileService } = await import(
        "@/lib/music/repository/reconcile-service"
    );
    console.log("[Nitro] Starting reconciliation service on server startup");
    reconcileService.start();

    // In production, pre-generate all album thumbnails so the first library
    // page load hits the disk cache instead of the sharp queue.
    if (process.env.NODE_ENV === "production") {
        const { default: db } = await import("@/lib/music/database/db");
        const { warmArtCache } = await import("@/lib/api/serve-art");
        const rows = db
            .prepare(
                "SELECT artpath FROM albums WHERE artpath IS NOT NULL AND missing_since IS NULL",
            )
            .all() as { artpath: string }[];
        warmArtCache(rows.map((r) => r.artpath)).catch(() => {});
    }
});
