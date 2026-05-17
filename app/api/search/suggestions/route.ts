import { NextRequest, NextResponse } from "next/server"
import { searchAlbums } from "@/lib/music/database/index"
import { searchItems } from "@/lib/music/database/index"

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''

    if (query.length < 2) {
        return NextResponse.json({ albums: [], tracks: [] })
    }

    try {
        // Get top 5 albums and tracks as suggestions
        const albums = searchAlbums(query, 0, 5)
        const tracks = searchItems(query, 0, 5)

        return NextResponse.json({
            albums,
            tracks,
        })
    } catch (error) {
        console.error('Search suggestions error:', error)
        return NextResponse.json({ albums: [], tracks: [] })
    }
}
