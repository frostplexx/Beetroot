import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/music/database/db';
import * as fs from 'fs';
import * as path from 'path';

/**
 * GET /api/album-art/[id]
 * Serve album art for an album or track
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const type = request.nextUrl.searchParams.get('type') || 'album';

        let artpath: string | null = null;

        if (type === 'album') {
            // Get album art path
            const album = db.prepare(`
                SELECT artpath FROM albums WHERE id = ?
            `).get(id) as any;

            artpath = album?.artpath;
        } else if (type === 'track') {
            // Get track art path
            const item = db.prepare(`
                SELECT artpath FROM items WHERE id = ?
            `).get(id) as any;

            artpath = item?.artpath;
        }

        // If no artpath, try to find cover.jpg in track's album folder
        if (!artpath && type === 'track') {
            const item = db.prepare('SELECT path FROM items WHERE id = ?').get(id) as any;
            if (item?.path) {
                const albumFolder = path.dirname(item.path);
                const possibleCovers = ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png'];

                for (const cover of possibleCovers) {
                    const coverPath = path.join(albumFolder, cover);
                    if (fs.existsSync(coverPath)) {
                        artpath = coverPath;
                        break;
                    }
                }
            }
        }

        if (!artpath || !fs.existsSync(artpath)) {
            // Return placeholder or 404
            return new NextResponse(null, { status: 404 });
        }

        // Read and serve the image
        const image = await fs.promises.readFile(artpath);
        const ext = path.extname(artpath).toLowerCase();
        const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';

        return new NextResponse(image, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Access-Control-Allow-Origin': '*',
                'Cross-Origin-Resource-Policy': 'cross-origin'
            }
        });
    } catch (error) {
        console.error('Album art error:', error);
        return new NextResponse(null, { status: 500 });
    }
}
