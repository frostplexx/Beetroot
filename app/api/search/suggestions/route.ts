import { NextRequest, NextResponse } from "next/server"
import { searchAlbums, searchItems } from "@/lib/music/database/index"

// Only the fields the dropdown actually renders. Avoids shipping ~80 columns
// per row over the wire and serializing them on the server.
interface AlbumSuggestion {
    id: number
    album: string
    albumartist: string
    artpath: string | null
    year: number | null
}

interface TrackSuggestion {
    id: number
    title: string
    artist: string
    album: string
}

const SUGGESTIONS_HEADERS = {
    "Content-Type": "application/json",
    // Light caching: rapid backspace-retype hits the same query repeatedly.
    "Cache-Control": "private, max-age=10",
}

export async function GET(request: NextRequest) {
    const query = (request.nextUrl.searchParams.get("q") || "").trim()
    if (query.length < 2) {
        return NextResponse.json({ albums: [], tracks: [] }, { headers: SUGGESTIONS_HEADERS })
    }

    try {
        const albums = searchAlbums(query, 0, 5).map<AlbumSuggestion>((a) => ({
            id: a.id,
            album: a.album,
            albumartist: a.albumartist,
            artpath: a.artpath,
            year: a.year,
        }))

        const tracks = searchItems(query, 0, 5).map<TrackSuggestion>((t) => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album,
        }))

        return NextResponse.json({ albums, tracks }, { headers: SUGGESTIONS_HEADERS })
    } catch (error) {
        console.error("Search suggestions error:", error)
        return NextResponse.json({ albums: [], tracks: [] }, { status: 500 })
    }
}
