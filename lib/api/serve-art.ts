import { promises as fsp } from "fs"
import path from "path"
import { createHash } from "crypto"
import sharp from "sharp"
import { globalConfig } from "../config"

// Libvips otherwise grows its operation/file caches and thread pool to fill
// available cores — for a hot-cache image server that mostly streams cached
// WebPs from disk, both are wasted RAM.
sharp.cache({ memory: 50, items: 50, files: 20 })
sharp.concurrency(2)

const MAX_SIZE = 2000

// L1 — in-process LRU. Keeps the hottest images in RAM so repeated requests
// within a session never touch disk.
const CACHE_LIMIT = 100
const cache = new Map<string, { buf: Buffer; etag: string; mtimeMs: number }>()

function lruGet(key: string) {
    const v = cache.get(key)
    if (!v) return undefined
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

// L2 — persistent disk thumbnail cache. Lives next to the database so it
// survives server restarts. A thumbnail is a small WebP file (~5-15 KB) keyed
// by a hash of the source path + mtime + size so stale entries are
// automatically ignored when the source file changes.
const ART_CACHE_DIR = (() => {
    const dbPath = globalConfig.database_path
    return path.join(path.dirname(path.resolve(dbPath)), ".art-cache")
})()

let _artCacheDirReady: Promise<void> | null = null
function ensureArtCacheDir(): Promise<void> {
    if (!_artCacheDirReady) {
        _artCacheDirReady = fsp.mkdir(ART_CACHE_DIR, { recursive: true }).then(() => {})
    }
    return _artCacheDirReady
}

function thumbFilePath(fullPath: string, mtimeMs: number, size: number): string {
    const hash = createHash("sha1").update(fullPath).digest("hex").slice(0, 16)
    return path.join(ART_CACHE_DIR, `${hash}-${mtimeMs.toString(36)}-${size}.webp`)
}

// Coalesces concurrent requests for the same (path, size, mtime) triple so
// only one sharp operation runs per unique image instead of N.
const inFlight = new Map<string, Promise<{ buf: Buffer; etag: string; mtimeMs: number }>>()

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
 * Three-layer cache: in-memory LRU → persistent disk thumbnails → sharp.
 * Handles ETag/If-None-Match revalidation.
 */
export async function serveArtFromPath(
    request: Request,
    fullPath: string,
    sizeParam: string | null,
): Promise<Response> {
    if (!isWithinMusicDir(fullPath)) {
        return new Response("Forbidden", { status: 403 })
    }

    let stat
    try {
        stat = await fsp.stat(fullPath)
    } catch {
        return new Response("Image not found", { status: 404 })
    }
    if (!stat.isFile()) {
        return new Response("Image not found", { status: 404 })
    }

    const size = parseSize(sizeParam)
    const etag = `"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}-${size}"`

    // 304 fast-path
    const ifNoneMatch = request.headers.get("if-none-match")
    if (ifNoneMatch && ifNoneMatch === etag) {
        return new Response(null, {
            status: 304,
            headers: { ETag: etag, "Cache-Control": "public, max-age=31536000" },
        })
    }

    if (size > 0) {
        const cacheKey = `${fullPath}|${size}|${stat.mtimeMs}`

        // L1: in-memory LRU
        const cached = lruGet(cacheKey)
        if (cached) {
            return new Response(cached.buf as unknown as BodyInit, {
                headers: baseHeaders("image/webp", cached.etag, cached.mtimeMs),
            })
        }

        // L2 + L3: coalesce concurrent requests, then try disk, then sharp
        let pending = inFlight.get(cacheKey)
        if (!pending) {
            pending = (async (): Promise<{ buf: Buffer; etag: string; mtimeMs: number }> => {
                await ensureArtCacheDir()
                const diskPath = thumbFilePath(fullPath, stat.mtimeMs, size)

                // L2: persistent disk thumbnail
                try {
                    const buf = await fsp.readFile(diskPath)
                    const entry = { buf, etag, mtimeMs: stat.mtimeMs }
                    lruSet(cacheKey, entry)
                    return entry
                } catch {
                    // not cached on disk yet
                }

                // L3: generate with sharp, persist to disk for future restarts
                const buf = await sharp(fullPath)
                    .resize(size, size, { fit: "inside", withoutEnlargement: true })
                    .webp({ quality: 80 })
                    .toBuffer()
                const entry = { buf, etag, mtimeMs: stat.mtimeMs }
                lruSet(cacheKey, entry)
                fsp.writeFile(diskPath, buf).catch(() => {})
                return entry
            })().finally(() => inFlight.delete(cacheKey))
            inFlight.set(cacheKey, pending)
        }

        const result = await pending
        return new Response(result.buf as unknown as BodyInit, {
            headers: baseHeaders("image/webp", result.etag, result.mtimeMs),
        })
    }

    const buf = await fsp.readFile(fullPath)
    const ext = path.extname(fullPath).toLowerCase()
    const contentType = CONTENT_TYPE_BY_EXT[ext] || "image/jpeg"

    return new Response(buf as unknown as BodyInit, {
        headers: baseHeaders(contentType, etag, stat.mtimeMs),
    })
}

export function notFoundArt(): Response {
    // Tell clients not to slam us if there's no art for this album.
    return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "public, max-age=300" },
    })
}

/**
 * Pre-generate thumbnails for all known art paths so the first library page
 * load hits the disk cache instead of running sharp per-request.
 * Processes 4 at a time to match the libuv thread pool size.
 * Safe to call multiple times — already-cached entries are skipped.
 */
export async function warmArtCache(artPaths: string[], size = 400): Promise<void> {
    try {
        await ensureArtCacheDir()
        let generated = 0
        let skipped = 0

        for (let i = 0; i < artPaths.length; i += 4) {
            await Promise.all(artPaths.slice(i, i + 4).map(async (artpath) => {
                try {
                    const stat = await fsp.stat(artpath)
                    const diskPath = thumbFilePath(artpath, stat.mtimeMs, size)
                    try {
                        await fsp.access(diskPath)
                        skipped++
                        return
                    } catch {}

                    const buf = await sharp(artpath)
                        .resize(size, size, { fit: "inside", withoutEnlargement: true })
                        .webp({ quality: 80 })
                        .toBuffer()
                    // Don't seed L1 here — keep L1 reserved for actual request
                    // traffic. Disk cache (L2) is the durable warm layer.
                    await fsp.writeFile(diskPath, buf)
                    generated++
                } catch {
                    // unreadable / missing file — skip silently
                }
            }))
        }

        if (generated > 0) console.log(`[art-cache] generated ${generated} thumbnails (${skipped} already cached)`)
    } catch (err) {
        console.error("[art-cache] warm failed:", err)
    }
}
