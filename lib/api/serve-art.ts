import { NextRequest, NextResponse } from "next/server"
import { promises as fsp } from "fs"
import path from "path"
import sharp from "sharp"
import { globalConfig } from "../config"

const MAX_SIZE = 2000

// Small LRU for resized output. Multi-MB JPEGs reduced to ~30-100KB webp;
// 200 entries ≈ 10-20MB worst case, which is fine for a single-process server.
const CACHE_LIMIT = 200
const cache = new Map<string, { buf: Buffer; etag: string; mtimeMs: number }>()

function lruGet(key: string) {
    const v = cache.get(key)
    if (!v) return undefined
    // Refresh recency
    cache.delete(key)
    cache.set(key, v)
    return v
}

function lruSet(key: string, value: { buf: Buffer; etag: string; mtimeMs: number }) {
    if (cache.has(key)) cache.delete(key)
    cache.set(key, value)
    if (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
    }
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}

function baseHeaders(contentType: string, etag: string, mtimeMs: number) {
    return {
        "Content-Type": contentType,
        // No `immutable` — art bytes can be replaced via the edit dialog. The
        // browser still uses the cache for normal navigation, but revalidates
        // via ETag on explicit reload so freshly-saved art shows up.
        "Cache-Control": "public, max-age=31536000",
        "ETag": etag,
        "Last-Modified": new Date(mtimeMs).toUTCString(),
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Cross-Origin-Resource-Policy": "cross-origin",
    }
}

function parseSize(raw: string | null): number {
    if (!raw) return 0
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.min(n, MAX_SIZE)
}

function isWithinMusicDir(fullPath: string): boolean {
    const dir = globalConfig.music_directory
    if (!dir) return true
    const resolvedDir = path.resolve(dir.replace(/^~/, process.env.HOME || ""))
    const resolvedTarget = path.resolve(fullPath)
    return resolvedTarget.startsWith(resolvedDir + path.sep) || resolvedTarget === resolvedDir
}

/**
 * Serve an image from disk, optionally resized + converted to webp.
 * Handles ETag/If-None-Match revalidation and caches resized output in-memory.
 */
export async function serveArtFromPath(
    request: NextRequest,
    fullPath: string,
    sizeParam: string | null,
): Promise<NextResponse> {
    if (!isWithinMusicDir(fullPath)) {
        return new NextResponse("Forbidden", { status: 403 })
    }

    let stat
    try {
        stat = await fsp.stat(fullPath)
    } catch {
        return new NextResponse("Image not found", { status: 404 })
    }
    if (!stat.isFile()) {
        return new NextResponse("Image not found", { status: 404 })
    }

    const size = parseSize(sizeParam)
    const etag = `"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}-${size}"`

    // 304 fast-path
    const ifNoneMatch = request.headers.get("if-none-match")
    if (ifNoneMatch && ifNoneMatch === etag) {
        return new NextResponse(null, {
            status: 304,
            headers: { ETag: etag, "Cache-Control": "public, max-age=31536000" },
        })
    }

    if (size > 0) {
        const cacheKey = `${fullPath}|${size}|${stat.mtimeMs}`
        const cached = lruGet(cacheKey)
        if (cached) {
            return new NextResponse(cached.buf as unknown as BodyInit, {
                headers: baseHeaders("image/webp", cached.etag, cached.mtimeMs),
            })
        }

        const resized = await sharp(fullPath)
            .resize(size, size, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer()

        lruSet(cacheKey, { buf: resized, etag, mtimeMs: stat.mtimeMs })

        return new NextResponse(resized as unknown as BodyInit, {
            headers: baseHeaders("image/webp", etag, stat.mtimeMs),
        })
    }

    const buf = await fsp.readFile(fullPath)
    const ext = path.extname(fullPath).toLowerCase()
    const contentType = CONTENT_TYPE_BY_EXT[ext] || "image/jpeg"

    return new NextResponse(buf as unknown as BodyInit, {
        headers: baseHeaders(contentType, etag, stat.mtimeMs),
    })
}

export function notFoundArt(): NextResponse {
    // Tell clients not to slam us if there's no art for this album.
    return new NextResponse(null, {
        status: 404,
        headers: { "Cache-Control": "public, max-age=300" },
    })
}
