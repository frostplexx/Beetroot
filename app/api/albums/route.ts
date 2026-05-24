import { NextRequest, NextResponse } from 'next/server';
import { getCachedAlbumsPaginatedSlim, getCachedAlbumCount } from '@/lib/music/database/albums';

/**
 * GET /api/albums - Fetch albums with pagination
 * Query params:
 *   - page: number (default: 0)
 *   - pageSize: number (default: 30)
 *
 * Responses are cached via `unstable_cache` and invalidated with
 * `revalidateTag('albums')` on any album write or reconcile completion.
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '0', 10);
        const pageSize = parseInt(searchParams.get('pageSize') || '30', 10);

        const [albums, total] = await Promise.all([
            getCachedAlbumsPaginatedSlim(page, pageSize),
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
