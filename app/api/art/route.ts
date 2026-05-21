import { NextRequest, NextResponse } from "next/server"
import { resolveArtPath } from "@/lib/music/database/index"
import fs from "fs"
import path from "path"
import sharp from "sharp"

const MAX_SIZE = 2000

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const artpath = searchParams.get("path")
    const sizeParam = searchParams.get("size")

    if (!artpath) {
        return new NextResponse("Missing path parameter", { status: 400 })
    }

    try {
        const fullPath = resolveArtPath(artpath)

        if (!fullPath || !fs.existsSync(fullPath)) {
            return new NextResponse("Image not found", { status: 404 })
        }

        // When the caller asks for a max dimension, resize on the fly to webp.
        // The album page only displays ~288px and color extraction works fine
        // on a few hundred pixels, so this saves multi-MB transfers + decodes.
        const size = sizeParam ? Math.min(parseInt(sizeParam, 10) || 0, MAX_SIZE) : 0
        if (size > 0) {
            const resized = await sharp(fullPath)
                .resize(size, size, { fit: "inside", withoutEnlargement: true })
                .webp({ quality: 80 })
                .toBuffer()

            return new NextResponse(resized as unknown as BodyInit, {
                headers: {
                    "Content-Type": "image/webp",
                    "Cache-Control": "public, max-age=31536000, immutable",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET",
                    "Cross-Origin-Resource-Policy": "cross-origin",
                },
            })
        }

        const imageBuffer = fs.readFileSync(fullPath)
        const ext = path.extname(fullPath).toLowerCase()

        // Determine content type based on extension
        const contentTypeMap: Record<string, string> = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
        }

        const contentType = contentTypeMap[ext] || "image/jpeg"

        return new NextResponse(imageBuffer, {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=31536000, immutable",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET",
                "Cross-Origin-Resource-Policy": "cross-origin",
            },
        })
    } catch (error) {
        console.error("Error serving image:", error)
        return new NextResponse("Internal server error", { status: 500 })
    }
}
