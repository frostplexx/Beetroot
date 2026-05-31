import { createFileRoute } from "@tanstack/react-router";
import Repository from "@/lib/music/repository";

export const Route = createFileRoute("/api/items/$id/restore")({
    server: {
        handlers: {
            POST: async ({ params }) => {
                const itemId = parseInt(params.id, 10);
                if (!Number.isFinite(itemId) || itemId <= 0) {
                    return Response.json({ error: "Invalid item ID" }, { status: 400 });
                }
                try {
                    const result = Repository.restoreItem(itemId);
                    return Response.json({ ...result, itemId });
                } catch (error) {
                    console.error("Error restoring item:", error);
                    return Response.json(
                        {
                            error: "Failed to restore item",
                            details: error instanceof Error ? error.message : "Unknown error",
                        },
                        { status: 500 },
                    );
                }
            },
        },
    },
});
