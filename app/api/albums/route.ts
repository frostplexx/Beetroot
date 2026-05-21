import { NextRequest, NextResponse } from 'next/server';
import { getAlbumsPaginated, getAlbumCount } from '@/lib/music/database';

export const dynamic = 'force-dynamic';

/**
 * GET /api/albums - Fetch albums with pagination
 * Query params:
 *   - page: number (default: 0)
 *   - pageSize: number (default: 30)
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '0', 10);
        const pageSize = parseInt(searchParams.get('pageSize') || '30', 10);

        const albums = getAlbumsPaginated(page, pageSize);
        const total = getAlbumCount();

        return NextResponse.json({
            albums,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize)
            }
        });
    } catch (error) {
        console.error('[API] Error fetching albums:', error);
        return NextResponse.json(
            { error: 'Failed to fetch albums' },
            { status: 500 }
        );
    }
}
