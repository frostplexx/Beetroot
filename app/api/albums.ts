import { createFileRoute } from "@tanstack/react-router";
import {
    getCachedAlbumsPaginatedSlim,
    getCachedAlbumCount,
    type AlbumSort,
} from "@/lib/music/database/albums";

const VALID_SORTS = new Set<AlbumSort>(["recently-added", "name", "artist", "year"]);

export const Route = createFileRoute("/api/albums")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                try {
                    const { searchParams } = new URL(request.url);
                    const page = parseInt(searchParams.get("page") || "0", 10);
                    const pageSize = parseInt(searchParams.get("pageSize") || "30", 10);
                    const rawSort = searchParams.get("sort") ?? "recently-added";
                    const sort: AlbumSort = VALID_SORTS.has(rawSort as AlbumSort)
                        ? (rawSort as AlbumSort)
                        : "recently-added";

                    const [albums, total] = await Promise.all([
                        getCachedAlbumsPaginatedSlim(page, pageSize, sort),
                        getCachedAlbumCount(),
                    ]);

                    return Response.json(
                        {
                            albums,
                            pagination: {
                                page,
                                pageSize,
                                total,
                                totalPages: Math.ceil(total / pageSize),
                            },
                        },
                        {
                            headers: {
                                "Cache-Control": "private, max-age=10, stale-while-revalidate=60",
                            },
                        },
                    );
                } catch (error) {
                    console.error("[API] Error fetching albums:", error);
                    return Response.json(
                        { error: "Failed to fetch albums" },
                        { status: 500 },
                    );
                }
            },
        },
    },
});
