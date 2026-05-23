import { NextRequest, NextResponse } from "next/server"
import { getItemsByAlbum } from "@/lib/music/database"
import { execFile } from "child_process"
import { promisify } from "util"
import * as fs from "fs"
import * as path from "path"

const execFileAsync = promisify(execFile)

export const dynamic = "force-dynamic"

// Reveal an album's folder in the host OS file manager (macOS-only for now,
// matching /api/items/[id]/reveal). The folder is derived from the first
// existing item path; revealing the folder itself (not a file inside it)
// is more useful for an album-level action.
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const albumId = parseInt(id, 10)
    if (!Number.isFinite(albumId) || albumId <= 0) {
        return NextResponse.json({ error: "Invalid album id" }, { status: 400 })
    }

    const items = getItemsByAlbum(albumId)
    const present = items.find(i => i.path && fs.existsSync(i.path))
    if (!present) {
        return NextResponse.json(
            { error: "No files on disk for this album" },
            { status: 404 }
        )
    }

    if (process.platform !== "darwin") {
        return NextResponse.json(
            { error: "Reveal-in-file-manager currently only implemented on macOS" },
            { status: 501 }
        )
    }

    const folder = path.dirname(present.path)
    try {
        // -R selects the path in Finder; for a directory this opens its parent
        // with the album folder highlighted, which is the conventional reveal UX.
        await execFileAsync("open", ["-R", folder])
        return NextResponse.json({ revealed: true, folder })
    } catch (err) {
        return NextResponse.json(
            {
                error: `Failed to reveal folder: ${err instanceof Error ? err.message : String(err)}`,
            },
            { status: 500 }
        )
    }
}
