/**
 * Build the URL for an album's cover art.
 *
 * `version` comes from the server as `art_version` (the art file's mtime) and
 * is what makes a replaced cover appear: the rest of the URL is keyed by album
 * id and never changes. See lib/api/art-version.ts for why the browser will not
 * refetch a constant URL.
 */
export function albumArtUrl(albumId: number, size: number, version: number | undefined): string {
    return `/api/album/${albumId}/art?size=${size}&t=${version ?? 0}`
}
