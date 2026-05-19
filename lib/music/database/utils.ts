import { globalConfig } from "@/lib/config"
import path from "path"

/**
 * Converts Uint8Array to string (for SQLite BLOB fields)
 */
export function decodeBuffer(value: any): string | null {
    if (value instanceof Uint8Array) {
        return Buffer.from(value).toString("utf8")
    }
    if (typeof value === "string") {
        return value
    }
    return null
}

/**
 * Recursively decodes all Uint8Array values in an object to strings
 */
export function decodeRow<T extends Record<string, any>>(row: T): T {
    const decoded = { ...row }
    for (const key in decoded) {
        const value = decoded[key]
        if (value && typeof value === 'object' && ArrayBuffer.isView(value)) {
            decoded[key] = decodeBuffer(value) as any
        }
    }
    return decoded
}

/**
 * Decodes an array of rows
 */
export function decodeRows<T extends Record<string, any>>(rows: T[]): T[] {
    return rows.map(decodeRow)
}

/**
 * Resolves a relative path from the beets music directory to an absolute path
 */
export function resolveArtPath(artpath: string | null): string | null {
    if (!artpath) {
        return null
    }

    // If already an absolute path, return as-is
    if (path.isAbsolute(artpath)) {
        return artpath
    }

    // Otherwise, join with music directory
    if (!globalConfig.music_directory) {
        return artpath
    }

    return path.join(globalConfig.music_directory, artpath)
}

/**
 * Resolves a relative path from the beets music directory to an absolute path
 */
export function resolveMusicPath(musicPath: string | null): string | null {
    if (!musicPath) {
        return null
    }

    // If already an absolute path, return as-is
    if (path.isAbsolute(musicPath)) {
        return musicPath
    }

    // Otherwise, join with music directory
    if (!globalConfig.music_directory) {
        return musicPath
    }

    return path.join(globalConfig.music_directory, musicPath)
}
