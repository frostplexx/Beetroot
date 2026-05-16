import { BEETS } from "../globals"
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
        if (decoded[key] instanceof Uint8Array) {
            decoded[key] = decodeBuffer(decoded[key]) as any
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
    if (!artpath || !BEETS.musicDirectory) {
        return artpath
    }
    return path.join(BEETS.musicDirectory, artpath)
}

/**
 * Resolves a relative path from the beets music directory to an absolute path
 */
export function resolveMusicPath(musicPath: string | null): string | null {
    if (!musicPath || !BEETS.musicDirectory) {
        return musicPath
    }
    return path.join(BEETS.musicDirectory, musicPath)
}
