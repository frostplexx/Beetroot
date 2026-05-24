import Library from "./library";
import {
    getCachedAlbumCount,
    getCachedAlbumsPaginatedSlim,
} from "@/lib/music/database/albums";

// Fixed pageSize. The Library wrapper is `absolute inset-0 overflow-hidden`
// and the grid uses `flex-1 min-h-0 overflow-hidden`, so rows that don't
// fit the viewport are clipped — pagination always stays in view.
const PAGE_SIZE = 30;

export default async function Home({
    searchParams,
}: {
    searchParams: Promise<{ page?: string }>;
}) {
    const params = await searchParams;
    const requested = Number(params.page);
    const page = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 1;

    const [albums, total] = await Promise.all([
        getCachedAlbumsPaginatedSlim(page - 1, PAGE_SIZE),
        getCachedAlbumCount(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <Library
            albums={albums}
            page={page}
            totalPages={totalPages}
            totalAlbums={total}
        />
    );
}
