import { NextRequest, NextResponse } from 'next/server';
import { getCachedAlbumsPaginatedSlim, getCachedAlbumCount, type AlbumSort } from '@/lib/music/database/albums';

const VALID_SORTS = new Set<AlbumSort>(["recently-added", "name", "artist", "year"]);

/**
 * GET /api/albums - Fetch albums with pagination
 * Query params:
 *   - page: number (default: 0)
 *   - pageSize: number (default: 30)
 *   - sort: AlbumSort (default: "recently-added")
 *
 * Responses are cached via `unstable_cache` and invalidated with
 * `revalidateTag('albums')` on any album write or reconcile completion.
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '0', 10);
        const pageSize = parseInt(searchParams.get('pageSize') || '30', 10);
        const rawSort = searchParams.get('sort') ?? "recently-added";
        const sort: AlbumSort = VALID_SORTS.has(rawSort as AlbumSort) ? rawSort as AlbumSort : "recently-added";

        const [albums, total] = await Promise.all([
            getCachedAlbumsPaginatedSlim(page, pageSize, sort),
            getCachedAlbumCount(),
        ]);

        return NextResponse.json(
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
                    'Cache-Control': 'private, max-age=10, stale-while-revalidate=60',
                },
            }
        );
    } catch (error) {
        console.error('[API] Error fetching albums:', error);
        return NextResponse.json(
            { error: 'Failed to fetch albums' },
            { status: 500 }
        );
    }
}
