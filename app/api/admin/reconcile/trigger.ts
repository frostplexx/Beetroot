import { createFileRoute } from "@tanstack/react-router";
import ReconcileService from "@/lib/music/repository/reconcile-service";

export const Route = createFileRoute("/api/admin/reconcile/trigger")({
    server: {
        handlers: {
            POST: async () => {
                try {
                    // Fire-and-forget: the worker emits status over SSE; the caller
                    // just needs an immediate ack so the UI doesn't spin waiting for
                    // a multi-minute scan to finish.
                    void ReconcileService.triggerNow();
                    return Response.json({ triggered: true });
                } catch (error) {
                    console.error("Error triggering reconcile:", error);
                    return Response.json(
                        {
                            error: "Failed to trigger reconcile",
                            details: error instanceof Error ? error.message : "Unknown error",
                        },
                        { status: 500 },
                    );
                }
            },
        },
    },
});
