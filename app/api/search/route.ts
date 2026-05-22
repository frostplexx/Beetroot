import { NextRequest, NextResponse } from 'next/server';
import { searchAlbums, getAlbumsSearchCount } from '@/lib/music/database';

export const dynamic = 'force-dynamic';

/**
 * GET /api/search - Search albums
 * Query params:
 *   - q: string (search query)
 *   - page: number (default: 0)
 *   - pageSize: number (default: 10)
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get('q') || '';
        const page = parseInt(searchParams.get('page') || '0', 10);
        const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

        if (!query.trim()) {
            return NextResponse.json({
                albums: [],
                pagination: {
                    page: 0,
                    pageSize,
                    total: 0,
                    totalPages: 0
                }
            });
        }

        const albums = searchAlbums(query, page, pageSize);
        const total = getAlbumsSearchCount(query);

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
        console.error('[API] Error searching albums:', error);
        return NextResponse.json(
            { error: 'Failed to search albums' },
            { status: 500 }
        );
    }
}
