import { cookies } from "next/headers";
import Library from "./library";
import {
    getCachedAlbumCount,
    getCachedAlbumsPaginatedSlim,
} from "@/lib/music/database/albums";

// The client measures the actual viewport-fit pageSize on mount and writes it
// back as the `library-page-size` cookie, so subsequent navigations render the
// right number of albums on the server (no double-fetch loop).
export const LIBRARY_PAGE_SIZE_COOKIE = "library-page-size";
const DEFAULT_PAGE_SIZE = 30;
const MIN_PAGE_SIZE = 4;
const MAX_PAGE_SIZE = 120;

export default async function Home({
    searchParams,
}: {
    searchParams: Promise<{ page?: string }>;
}) {
    const params = await searchParams;
    const cookieStore = await cookies();
    const rawCookie = Number(cookieStore.get(LIBRARY_PAGE_SIZE_COOKIE)?.value);
    const pageSize =
        Number.isFinite(rawCookie) && rawCookie >= MIN_PAGE_SIZE && rawCookie <= MAX_PAGE_SIZE
            ? Math.floor(rawCookie)
            : DEFAULT_PAGE_SIZE;

    const requested = Number(params.page);
    const page = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 1;

    const [albums, total] = await Promise.all([
        getCachedAlbumsPaginatedSlim(page - 1, pageSize),
        getCachedAlbumCount(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return (
        <Library
            albums={albums}
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
        />
    );
}
