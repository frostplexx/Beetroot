import { NextResponse } from 'next/server';
import db from '@/lib/music/database/db';
import * as fs from 'fs';
import * as path from 'path';

/**
 * POST /api/albums/rebuild
 * Rebuilds the albums table from existing tracks
 */
export async function POST() {
    try {
        console.log('Rebuilding albums from tracks...');

        // Get all unique album + albumartist combinations
        const albumGroups = db.prepare(`
            SELECT DISTINCT
                album,
                albumartist,
                MIN(year) as year,
                MIN(month) as month,
                MIN(day) as day,
                MIN(label) as label,
                MIN(mb_albumid) as mb_albumid,
                MIN(mb_releasegroupid) as mb_releasegroupid,
                MIN(country) as country,
                MIN(albumtype) as albumtype,
                MIN(artpath) as artpath,
                MIN(genres) as genres,
                COUNT(*) as track_count
            FROM items
            WHERE album IS NOT NULL AND albumartist IS NOT NULL
            GROUP BY album, albumartist
        `).all() as Array<{
            album: string;
            albumartist: string;
            year: number | null;
            month: number | null;
            day: number | null;
            label: string | null;
            mb_albumid: string | null;
            mb_releasegroupid: string | null;
            country: string | null;
            albumtype: string | null;
            artpath: string | null;
            genres: string | null;
            track_count: number;
        }>;

        let created = 0;
        let updated = 0;

        for (const group of albumGroups) {
            // If no artpath, try to find cover file in album folder
            let artpath = group.artpath;
            if (!artpath) {
                // Get a track path from this album to find the folder
                const sampleTrack = db.prepare(`
                    SELECT path FROM items
                    WHERE album = ? AND albumartist = ?
                    LIMIT 1
                `).get(group.album, group.albumartist) as { path: string } | undefined;

                if (sampleTrack?.path) {
                    const albumFolder = path.dirname(sampleTrack.path);
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

            // Check if album already exists
            const existing = db.prepare(`
                SELECT id FROM albums
                WHERE album = ? AND albumartist = ?
            `).get(group.album, group.albumartist) as { id: number } | undefined;

            if (existing) {
                // Update existing
                db.prepare(`
                    UPDATE albums SET
                        year = COALESCE(year, ?),
                        month = COALESCE(month, ?),
                        day = COALESCE(day, ?),
                        label = COALESCE(label, ?),
                        mb_albumid = COALESCE(mb_albumid, ?),
                        mb_releasegroupid = COALESCE(mb_releasegroupid, ?),
                        country = COALESCE(country, ?),
                        albumtype = COALESCE(albumtype, ?),
                        artpath = COALESCE(artpath, ?),
                        genres = COALESCE(genres, ?)
                    WHERE id = ?
                `).run(
                    group.year, group.month, group.day,
                    group.label,
                    group.mb_albumid,
                    group.mb_releasegroupid,
                    group.country,
                    group.albumtype,
                    artpath,
                    group.genres,
                    existing.id
                );

                // Link tracks to this album
                db.prepare(`
                    UPDATE items SET album_id = ?
                    WHERE album = ? AND albumartist = ?
                `).run(existing.id, group.album, group.albumartist);

                updated++;
            } else {
                // Create new album
                const result = db.prepare(`
                    INSERT INTO albums (
                        album, albumartist,
                        year, month, day,
                        label,
                        mb_albumid, mb_releasegroupid,
                        country, albumtype, artpath, genres,
                        added
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    group.album,
                    group.albumartist,
                    group.year, group.month, group.day,
                    group.label,
                    group.mb_albumid,
                    group.mb_releasegroupid,
                    group.country,
                    group.albumtype,
                    artpath,
                    group.genres,
                    Date.now()
                );

                const albumId = Number(result.lastInsertRowid);

                // Link tracks to this album
                db.prepare(`
                    UPDATE items SET album_id = ?
                    WHERE album = ? AND albumartist = ?
                `).run(albumId, group.album, group.albumartist);

                created++;
            }
        }

        console.log(`Albums rebuilt: ${created} created, ${updated} updated`);

        return NextResponse.json({
            success: true,
            created,
            updated,
            total: created + updated
        });
    } catch (error) {
        console.error('Rebuild albums error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Rebuild failed' },
            { status: 500 }
        );
    }
}
