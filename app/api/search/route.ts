import { NextRequest, NextResponse } from 'next/server';
import { searchAlbums, getAlbumsSearchCount } from '@/lib/music/database';
import { searchItems } from '@/lib/music/database/items';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get('q') || '';
        const page = parseInt(searchParams.get('page') || '0', 10);
        const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

        if (!query.trim()) {
            return NextResponse.json({
                albums: [],
                tracks: [],
                pagination: { page: 0, pageSize, total: 0, totalPages: 0 }
            });
        }

        const albums = searchAlbums(query, page, pageSize);
        const total = getAlbumsSearchCount(query);

        const rawTracks = searchItems(query, 0, 10);
        const tracks = rawTracks
            .filter(item => item.album_id != null)
            .map(item => ({
                id: item.id,
                title: item.title,
                artist: item.artist,
                album: item.album,
                album_id: item.album_id,
                track: item.track,
                year: item.year,
                added: item.added,
            }));

        return NextResponse.json({
            albums,
            tracks,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize)
            }
        });
    } catch (error) {
        console.error('[API] Error searching:', error);
        return NextResponse.json(
            { error: 'Failed to search' },
            { status: 500 }
        );
    }
}
