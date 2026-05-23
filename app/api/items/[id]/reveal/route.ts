import { NextRequest, NextResponse } from 'next/server';
import { getItemById } from '@/lib/music/database';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';

/**
 * POST /api/items/[id]/reveal
 *
 * Reveals the item's file in the host OS file manager. macOS-only at the
 * moment (uses `open -R`). The server must be running on the same machine
 * as the file system.
 */
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const itemId = parseInt(id, 10);
    if (Number.isNaN(itemId)) {
        return NextResponse.json({ error: 'Invalid item id' }, { status: 400 });
    }

    const item = getItemById(itemId);
    if (!item) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    if (!fs.existsSync(item.path)) {
        return NextResponse.json(
            { error: `File does not exist: ${item.path}` },
            { status: 404 }
        );
    }

    if (process.platform !== 'darwin') {
        return NextResponse.json(
            { error: 'Reveal-in-file-manager currently only implemented on macOS' },
            { status: 501 }
        );
    }

    try {
        await execFileAsync('open', ['-R', item.path]);
        return NextResponse.json({ revealed: true, path: item.path });
    } catch (err) {
        return NextResponse.json(
            {
                error: `Failed to reveal file: ${err instanceof Error ? err.message : String(err)}`,
            },
            { status: 500 }
        );
    }
}
