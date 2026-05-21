import { NextRequest, NextResponse } from "next/server"
import { resolveArtPath } from "@/lib/music/database/index"
import { serveArtFromPath, notFoundArt } from "@/lib/api/serve-art"

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const artpath = searchParams.get("path")

    if (!artpath) {
        return new NextResponse("Missing path parameter", { status: 400 })
    }

    const fullPath = resolveArtPath(artpath)
    if (!fullPath) return notFoundArt()

    try {
        return await serveArtFromPath(request, fullPath, searchParams.get("size"))
    } catch (error) {
        console.error("Error serving image:", error)
        return new NextResponse("Internal server error", { status: 500 })
    }
}
