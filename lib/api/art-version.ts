import { statSync } from "fs"

/**
 * Version token for an album's artwork, taken from the art file's mtime.
 *
 * Art URLs are keyed by album id, so replacing a cover leaves the URL byte for
 * byte identical. React then skips the DOM update, and even on a remount the
 * browser answers from its per-document memory cache, which `no-cache` does not
 * reach. Only a changing URL makes a replaced cover visible without a reload.
 *
 * Returns 0 when there is no readable art file; serve-art answers those with
 * its own 404.
 */
export function artVersion(artpath: string | null | undefined): number {
    if (!artpath) return 0
    try {
        return Math.trunc(statSync(artpath).mtimeMs)
    } catch {
        return 0
    }
}

/** Attach {@link artVersion} to rows so list responses can build art URLs. */
export function withArtVersion<T extends { artpath: string | null }>(
    rows: T[],
): Array<T & { art_version: number }> {
    return rows.map((row) => ({ ...row, art_version: artVersion(row.artpath) }))
}
