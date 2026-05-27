import Library from "./library";
import {
    getCachedAlbumCount,
    getCachedAlbumsPaginatedSlim,
    type AlbumSort,
} from "@/lib/music/database/albums";

// Fixed pageSize. The Library wrapper is `absolute inset-0 overflow-hidden`
// and the grid uses `flex-1 min-h-0 overflow-hidden`, so rows that don't
// fit the viewport are clipped — pagination always stays in view.
const PAGE_SIZE = 30;

const VALID_SORTS = new Set<AlbumSort>(["recently-added", "name", "artist", "year"]);

function parseSort(raw: string | undefined): AlbumSort {
    if (raw && VALID_SORTS.has(raw as AlbumSort)) return raw as AlbumSort;
    return "recently-added";
}

export default async function Home({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; sort?: string }>;
}) {
    const params = await searchParams;
    const requested = Number(params.page);
    const page = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 1;
    const sort = parseSort(params.sort);

    const [albums, total] = await Promise.all([
        getCachedAlbumsPaginatedSlim(page - 1, PAGE_SIZE, sort),
        getCachedAlbumCount(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <Library
            albums={albums}
            page={page}
            totalPages={totalPages}
            totalAlbums={total}
            sort={sort}
        />
    );
}
