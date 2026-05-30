import { promises as fsp } from "fs"
import {
    batchUpdateItems,
    checkAndUpdateAlbumMissingStatus,
    getItemsByAlbum,
    Item,
} from "../database"

const VERIFY_COOLDOWN_MS = 5 * 60 * 1000
const lastVerifiedAt = new Map<number, number>()

// Stat every track for an album and reconcile its missing_since flags, then
// roll up the album status. Throttled per-album so repeated art 404s don't
// spam the filesystem.
export async function verifyAlbumPresence(albumId: number): Promise<void> {
    const now = Date.now()
    const last = lastVerifiedAt.get(albumId) ?? 0
    if (now - last < VERIFY_COOLDOWN_MS) return
    lastVerifiedAt.set(albumId, now)

    try {
        const items = getItemsByAlbum(albumId)
        if (items.length === 0) {
            checkAndUpdateAlbumMissingStatus(albumId)
            return
        }

        const updates: Array<{ id: number; fields: Partial<Item> }> = []

        await Promise.all(items.map(async item => {
            if (!item.path) return
            try {
                await fsp.access(item.path)
                if (item.missing_since != null) {
                    updates.push({ id: item.id, fields: { missing_since: null } })
                }
            } catch {
                if (item.missing_since == null) {
                    updates.push({ id: item.id, fields: { missing_since: now } })
                }
            }
        }))

        if (updates.length > 0) {
            batchUpdateItems(updates)
            console.log(`[verifyAlbumPresence] album ${albumId}: updated ${updates.length} item(s)`)
        }

        checkAndUpdateAlbumMissingStatus(albumId)
    } catch (error) {
        console.error(`[verifyAlbumPresence] album ${albumId}:`, error)
    }
}
