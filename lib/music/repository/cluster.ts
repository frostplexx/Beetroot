import path from "path"
import { Item } from "../database"
import { normalizeAlbumString } from "../database/normalize"

export type ClusterKey = string

export interface Cluster {
    key: ClusterKey
    tracks: Item[]
    folderPath: string
    seedAlbum: string | null
    seedAlbumArtist: string | null
}

// Derive a per-track cluster key. Tag-driven so a "Downloads"-style mixed
// folder produces one cluster per album tag rather than one giant fake album.
// Folder participates only when tags can't disambiguate.
export function clusterKeyFor(item: Item): ClusterKey {
    const folder = item.path ? path.dirname(item.path) : ""
    const album = normalizeAlbumString(item.album)
    const albumArtist = normalizeAlbumString(item.albumartist || item.artist)

    if (album && albumArtist) {
        return `tag|${album}|${albumArtist}`
    }
    if (album) {
        // generic album name with no artist — fold by folder to avoid merging
        // two unrelated "Greatest Hits" folders.
        return `tag-folder|${album}|${folder}`
    }
    return `folder|${folder}`
}

// Group a batch of tag-parsed items into clusters. The seed album/artist is
// picked by majority (with first non-empty as a fallback) so a single
// outlier tag doesn't poison the cluster's MB lookup.
export function clusterTracks(items: Item[]): Cluster[] {
    const groups = new Map<ClusterKey, Item[]>()
    for (const item of items) {
        const key = clusterKeyFor(item)
        const arr = groups.get(key)
        if (arr) arr.push(item)
        else groups.set(key, [item])
    }

    const clusters: Cluster[] = []
    for (const [key, tracks] of groups) {
        clusters.push({
            key,
            tracks,
            folderPath: tracks[0].path ? path.dirname(tracks[0].path) : "",
            seedAlbum: pickMajority(tracks.map(t => t.album)),
            seedAlbumArtist: pickMajority(
                tracks.map(t => t.albumartist || t.artist)
            ),
        })
    }
    return clusters
}

function pickMajority(values: Array<string | null | undefined>): string | null {
    const counts = new Map<string, number>()
    let firstNonEmpty: string | null = null
    for (const v of values) {
        if (!v) continue
        if (firstNonEmpty == null) firstNonEmpty = v
        counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    let best: string | null = null
    let bestCount = 0
    for (const [v, c] of counts) {
        if (c > bestCount) {
            best = v
            bestCount = c
        }
    }
    return best ?? firstNonEmpty
}
