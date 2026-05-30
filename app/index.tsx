import { createFileRoute } from "@tanstack/react-router";
import Library from "./-library";
import type { AlbumSort } from "@/lib/music/database/albums";

export const Route = createFileRoute("/")({
    validateSearch: (search: Record<string, unknown>) => {
        return {
            page: Number(search?.page ?? 1),
            sort: (search?.sort as AlbumSort) || "recently-added",
        };
    },
    component: HomePage,
});

function HomePage() {
    const { page, sort } = Route.useSearch();
    return <Library page={page} sort={sort} />;
}
