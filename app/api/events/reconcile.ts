import { createFileRoute } from "@tanstack/react-router";
import ReconcileService from "@/lib/music/repository/reconcile-service";

export const Route = createFileRoute("/api/events/reconcile")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const encoder = new TextEncoder();
                let cleanup: () => void = () => {};

                const stream = new ReadableStream({
                    start(controller) {
                        let cleanedUp = false;

                        const data = JSON.stringify({
                            type: "connected",
                            timestamp: Date.now(),
                        });
                        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                        console.debug("[SSE] Client connected");

                        const status = ReconcileService.getStatus();
                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify({ type: "status", data: status })}\n\n`,
                            ),
                        );

                        const handleReconcileEvent = (event: any) => {
                            try {
                                const data = JSON.stringify(event);
                                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                            } catch (error) {
                                console.error(
                                    "[SSE] Send failed:",
                                    error instanceof Error ? error.message : String(error),
                                );
                                cleanup();
                            }
                        };

                        ReconcileService.on("reconcile", handleReconcileEvent);

                        const keepaliveInterval = setInterval(() => {
                            try {
                                controller.enqueue(encoder.encode(`: keepalive\n\n`));
                            } catch {
                                cleanup();
                            }
                        }, 30000);

                        cleanup = () => {
                            if (cleanedUp) return;
                            cleanedUp = true;
                            ReconcileService.off("reconcile", handleReconcileEvent);
                            clearInterval(keepaliveInterval);
                            request.signal.removeEventListener("abort", cleanup);
                            console.debug("[SSE] Client disconnected, cleaned up");
                            try {
                                controller.close();
                            } catch {
                                // already closed
                            }
                        };

                        request.signal.addEventListener("abort", cleanup);
                    },
                    cancel() {
                        cleanup();
                    },
                });

                return new Response(stream, {
                    headers: {
                        "Content-Type": "text/event-stream",
                        "Cache-Control": "no-cache, no-transform",
                        Connection: "keep-alive",
                        "X-Accel-Buffering": "no",
                    },
                });
            },
        },
    },
});
