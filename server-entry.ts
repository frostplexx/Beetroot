import {
    createStartHandler,
    defaultStreamHandler,
} from "@tanstack/react-start/server"
import type { Register } from "@tanstack/react-router"
import type { RequestHandler } from "@tanstack/react-start/server"
import reconcileService from "@/lib/music/repository/reconcile-service"

reconcileService.start()

if (process.env.NODE_ENV === "production") {
    import("@/lib/music/database/db").then(({ default: db }) => {
        import("@/lib/api/serve-art").then(({ warmArtCache }) => {
            const rows = db
                .prepare(
                    "SELECT artpath FROM albums WHERE artpath IS NOT NULL AND missing_since IS NULL",
                )
                .all() as { artpath: string }[]
            warmArtCache(rows.map((r) => r.artpath)).catch(() => {})
        })
    })
}

const fetch = createStartHandler(defaultStreamHandler)

export type ServerEntry = { fetch: RequestHandler<Register> }

export function createServerEntry(entry: ServerEntry): ServerEntry {
    return {
        async fetch(...args) {
            return await entry.fetch(...args)
        },
    }
}

export default createServerEntry({ fetch })
