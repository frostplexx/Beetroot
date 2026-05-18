import Database from 'better-sqlite3';
import { getAcoustidFingerprint } from '../metadata/acoustid';
import { readLocalTags } from './sources/tags';
import { fetchMusicBrainzData } from './sources/musicbrainz';
import { fetchLastFmGenres } from './sources/lastfm';
import { mergeTrackData } from './merger';
import { syncTrack, resolveConflict as resolveSyncConflict, getTrackConflicts } from './sync';
import {
    TrackData,
    ScoredTrackData,
    ImportOptions,
    SyncResult,
    WriteBackResult,
    SyncConflict,
    DataSource
} from './types';
import { writeTagsToFile, moveTrackToLocation } from './writeback';
import { albumArtManager } from './albumart';
import { stripEmbeddedAlbumArt } from './albumart/strip';
import { expandPath } from './utils';
import { globalConfig } from '@/lib/config';

export class TrackRepository {
    constructor(private db: Database.Database) { }

    /**
     * Imports a track from file tags, optionally enriching with MusicBrainz/Last.fm
     */
    async importTrack(
        filePath: string,
        options: ImportOptions = {}
    ): Promise<{ trackId: number; conflicts: SyncConflict[] }> {
        console.log('\n========== IMPORT TRACK START ==========');
        console.log('File:', filePath);
        console.log('Options:', JSON.stringify(options, null, 2));

        const {
            skipMusicBrainz = false,
            skipLastFm = false,
            writeBack = 'missing-only',
            conflictResolution = 'keep-db',
            organizeFiles = false
        } = options;

        console.log('Parsed options:', { skipMusicBrainz, skipLastFm, writeBack, conflictResolution, organizeFiles });

        // Check if track already exists
        console.log('→ Checking if track already exists in database...');
        const existingTrack = this.findTrackByPath(filePath);
        console.log('  Existing track:', existingTrack ? `Found (id=${existingTrack.id})` : 'Not found (new import)');

        // Gather data from sources
        console.log('\n→ Gathering data from sources...');
        const sources: ScoredTrackData[] = [];

        // 1. Read local tags (always)
        console.log('  [1/3] Reading local file tags...');
        const localTags = await readLocalTags(filePath);
        console.log('  ✓ Local tags:', {
            title: localTags.data.title,
            artists: localTags.data.artists,
            album: localTags.data.album,
            duration: localTags.data.duration,
            confidence: localTags.confidence
        });
        sources.push(localTags);

        // 2. Fetch MusicBrainz data (optional)
        console.log('  [2/3] MusicBrainz lookup...');
        if (!skipMusicBrainz && localTags.data.duration) {
            console.log('    → Enabled, has duration - fetching...');
            try {
                const chromaprint = await getAcoustidFingerprint(filePath);
                console.log('    → Got fingerprint:', chromaprint.fingerprint.substring(0, 50) + '...');
                const mbData = await fetchMusicBrainzData(
                    filePath,
                    chromaprint.fingerprint,
                    chromaprint.duration
                );
                if (mbData) {
                    console.log('    ✓ MusicBrainz data:', {
                        title: mbData.data.title,
                        artists: mbData.data.artists,
                        album: mbData.data.album,
                        releaseId: mbData.data.releaseId,
                        confidence: mbData.confidence
                    });
                    sources.push(mbData);
                } else {
                    console.log('    ⚠ No MusicBrainz match found');
                }
            } catch (error) {
                console.warn('    ✗ Failed to fetch MusicBrainz data:', error);
            }
        } else {
            console.log('    ⊘ Skipped:', skipMusicBrainz ? 'disabled in options' : 'no duration in tags');
        }

        // 3. Fetch Last.fm genres (optional)
        console.log('  [3/3] Last.fm genre lookup...');
        if (!skipLastFm && localTags.data.artists?.[0] && localTags.data.album) {
            console.log(`    → Enabled, fetching genres for "${localTags.data.artists[0]}" - "${localTags.data.album}"...`);
            const lfmGenres = await fetchLastFmGenres(
                localTags.data.artists[0],
                localTags.data.album,
                filePath
            );
            if (lfmGenres) {
                console.log('    ✓ Last.fm genres:', lfmGenres.data.genres);
                sources.push(lfmGenres);
            } else {
                console.log('    ⚠ No Last.fm data found');
            }
        } else {
            const reason = skipLastFm ? 'disabled in options' : 'missing artist or album in tags';
            console.log(`    ⊘ Skipped: ${reason}`);
        }

        console.log('\n→ Total sources gathered:', sources.length);

        // Merge data
        console.log('\n→ Merging data from all sources...');
        const existingData = existingTrack ? this.getTrackData(existingTrack.id) : undefined;
        const existingSources = existingTrack ? this.getTrackSources(existingTrack.id) : undefined;

        if (existingData) {
            console.log('  Using existing DB data for conflict resolution');
        }

        const { merged, conflicts: mergeConflicts } = mergeTrackData(
            sources,
            existingData,
            existingSources,
            conflictResolution
        );

        console.log('  ✓ Merged track data:', {
            title: merged.title,
            artists: merged.artists,
            album: merged.album,
            albumArtist: merged.albumArtist,
            year: merged.year,
            trackNumber: merged.trackNumber,
            compilation: merged.compilation,
            genres: merged.genres
        });
        console.log('  Conflicts found:', mergeConflicts.length);

        // Upsert to database
        console.log('\n→ Saving to database...');
        const trackId = this.upsertTrack(merged, sources);
        console.log(`  ✓ Track saved with id=${trackId}`);

        // Create/update album and link track to it
        if (merged.album && merged.albumArtist) {
            console.log(`\n→ Creating/updating album "${merged.album}" by ${merged.albumArtist}...`);
            const albumId = this.upsertAlbum(merged);
            console.log(`  ✓ Album id=${albumId}`);
            this.linkTrackToAlbum(trackId, albumId);
            console.log(`  ✓ Linked track ${trackId} to album ${albumId}`);
        } else {
            console.log('\n→ No album info, skipping album creation');
        }

        // Store conflicts
        const conflicts = mergeConflicts.map(c => ({
            ...c,
            trackId,
            timestamp: new Date(),
        }));

        if (conflicts.length > 0) {
            console.log(`\n→ Storing ${conflicts.length} conflicts for manual resolution`);
            this.storeConflicts(conflicts);
        }

        // Organize files BEFORE fetching album art so cover is saved in the right place
        console.log('\n→ File organization...');
        console.log(`  organizeFiles=${organizeFiles}, has paths config=${!!globalConfig.paths}`);

        let finalFilePath = merged.filePath; // Track the current file path

        if (organizeFiles && globalConfig.paths) {
            try {
                console.log('  → Organizing file into folder structure...');
                const musicDir = expandPath(globalConfig.music_directory);
                console.log('  Music directory:', musicDir);

                // Choose template based on track type
                let template = globalConfig.paths.default;
                let templateType = 'default';

                if (merged.compilation && globalConfig.paths.comp) {
                    template = globalConfig.paths.comp;
                    templateType = 'compilation';
                } else if (!merged.album && globalConfig.paths.singleton) {
                    template = globalConfig.paths.singleton;
                    templateType = 'singleton';
                }

                console.log(`  Template type: ${templateType}`);
                console.log(`  Template: "${template}"`);
                console.log('  Track data for template:', {
                    albumArtist: merged.albumArtist,
                    artist: merged.artists?.[0],
                    album: merged.album,
                    title: merged.title,
                    trackNumber: merged.trackNumber,
                    compilation: merged.compilation
                });

                const oldPath = merged.filePath;
                console.log('  Current path:', oldPath);

                const newPath = await moveTrackToLocation(merged, template, musicDir);

                console.log('  New path:', newPath);

                if (oldPath !== newPath) {
                    // Update track path in database and in-memory
                    console.log('  → Updating path in database...');
                    this.db.prepare('UPDATE items SET path = ? WHERE id = ?').run(newPath, trackId);
                    finalFilePath = newPath; // Update for album art fetching
                    merged.filePath = newPath; // Update merged data
                    console.log('  ✓ File moved and database updated');
                } else {
                    console.log('  ℹ File already in correct location');
                }
            } catch (error) {
                console.error('  ✗ File organization failed:', error);
                console.error('  Stack:', error instanceof Error ? error.stack : 'no stack');
                // Don't abort import if file move fails
            }
        } else {
            const reason = !organizeFiles ? 'organizeFiles=false' : 'no paths config';
            console.log(`  ⊘ Skipped: ${reason}`);
        }

        // Fetch and save album art (after file has been moved)
        console.log('\n→ Fetching album art...');
        try {
            const albumFolder = albumArtManager.getAlbumFolder(finalFilePath);
            console.log('  Album folder:', albumFolder);
            const coverPath = await albumArtManager.fetchAndSave(
                {
                    filePath: finalFilePath,
                    releaseId: merged.releaseId,
                    artist: merged.artists?.[0] || merged.albumArtist,
                    album: merged.album
                },
                albumFolder,
                { minWidth: 300, minHeight: 300 }
            );

            if (coverPath) {
                console.log('  ✓ Album art saved:', coverPath);
                // Update track with cover path
                merged.coverPath = coverPath;
                this.updateCoverPath(trackId, coverPath);

                // Strip embedded album art from FLAC files to avoid duplication
                console.log('  → Checking if embedded art should be stripped...');
                try {
                    const wasStripped = await stripEmbeddedAlbumArt(finalFilePath);
                    if (wasStripped) {
                        console.log('  ✓ Embedded art removed from file');
                    }
                } catch (stripError) {
                    console.warn('  ⚠ Failed to strip embedded art (non-critical):', stripError);
                }
            } else {
                console.log('  ⚠ No album art found');
            }
        } catch (error) {
            // Don't abort import if album art fails
            console.warn('  ✗ Album art fetch failed (non-critical):', error);
        }

        // Write back to file if requested
        console.log('\n→ Write-back to file...');
        const shouldWriteback = writeBack === 'always' || (writeBack === 'missing-only' && !existingTrack);
        console.log(`  Mode: ${writeBack}, Existing track: ${!!existingTrack}, Should writeback: ${shouldWriteback}`);
        if (shouldWriteback) {
            console.log('  → Writing tags to file...');
            try {
                await writeTagsToFile(finalFilePath, merged);
                console.log('  ✓ Tags written successfully');
            } catch (error) {
                console.error('  ✗ Write-back failed:', error);
                throw error; // Abort import on write-back failure
            }
        } else {
            console.log('  ⊘ Skipped');
        }

        console.log('\n========== IMPORT TRACK COMPLETE ==========');
        console.log('Track ID:', trackId);
        console.log('Conflicts:', conflicts.length);
        console.log('===========================================\n');

        return { trackId, conflicts };
    }

    /**
     * Syncs an existing track with its file
     */
    async syncTrackById(trackId: number): Promise<SyncResult> {
        const track = this.getTrackData(trackId);
        if (!track) {
            return { status: 'missing' };
        }

        return syncTrack(this.db, trackId, track.filePath);
    }

    /**
     * Resolves a conflict
     */
    resolveConflict(
        conflictId: number,
        resolution: 'db' | 'file' | 'mb' | 'custom',
        customValue?: unknown
    ): void {
        resolveSyncConflict(this.db, conflictId, resolution, customValue);
    }

    /**
     * Gets all conflicts for a track
     */
    getConflicts(trackId: number): SyncConflict[] {
        return getTrackConflicts(this.db, trackId);
    }

    /**
     * Marks a track as missing
     */
    markMissing(trackId: number): void {
        this.db.prepare(`
            UPDATE items SET missing_since = ? WHERE id = ?
        `).run(Date.now(), trackId);
    }

    /**
     * Updates cover path for a track
     */
    private updateCoverPath(trackId: number, coverPath: string): void {
        this.db.prepare(`
            UPDATE items SET artpath = ? WHERE id = ?
        `).run(coverPath, trackId);
    }

    /**
     * Fetches album art for an existing track
     */
    async fetchAlbumArtForTrack(trackId: number): Promise<string | null> {
        const track = this.getTrackData(trackId);
        if (!track) {
            throw new Error(`Track ${trackId} not found`);
        }

        const albumFolder = albumArtManager.getAlbumFolder(track.filePath);
        const coverPath = await albumArtManager.fetchAndSave(
            {
                filePath: track.filePath,
                releaseId: track.releaseId,
                artist: track.artists?.[0] || track.albumArtist,
                album: track.album
            },
            albumFolder
        );

        if (coverPath) {
            this.updateCoverPath(trackId, coverPath);
        }

        return coverPath;
    }

    /**
     * Finds track by file path
     */
    private findTrackByPath(filePath: string): { id: number } | undefined {
        const row = this.db.prepare(`
            SELECT id FROM items WHERE path = ?
        `).get(filePath) as any;

        return row ? { id: row.id } : undefined;
    }

    /**
     * Gets track data from database
     */
    private getTrackData(trackId: number): TrackData | null {
        const row = this.db.prepare(`
            SELECT
                title, artist, artists, album, albumartist,
                year, month, day, track as trackNumber, tracktotal as trackTotal,
                disc as discNumber, disctotal as discTotal,
                genres, length as duration, comp as compilation,
                label, isrc, mb_trackid as musicbrainzId,
                acoustid_id as acoustId, mb_albumid as releaseId,
                path as filePath, file_hash as fileHash
            FROM items WHERE id = ?
        `).get(trackId) as any;

        if (!row) return null;

        return {
            title: row.title,
            artists: row.artists ? JSON.parse(row.artists) : [row.artist],
            album: row.album,
            albumArtist: row.albumartist,
            year: row.year,
            month: row.month,
            day: row.day,
            trackNumber: row.trackNumber,
            trackTotal: row.trackTotal,
            discNumber: row.discNumber,
            discTotal: row.discTotal,
            genres: row.genres ? JSON.parse(row.genres) : [],
            duration: row.duration,
            compilation: Boolean(row.compilation),
            label: row.label,
            isrc: row.isrc,
            musicbrainzId: row.musicbrainzId,
            acoustId: row.acoustId,
            releaseId: row.releaseId,
            filePath: row.filePath,
            fileHash: row.fileHash,
        };
    }

    /**
     * Gets source information for track fields
     */
    private getTrackSources(trackId: number): Partial<Record<keyof TrackData, DataSource>> {
        const row = this.db.prepare(`
            SELECT
                title_source, artist_source, artists_source, album_source,
                albumartist_source, year_source, genres_source, length_source,
                mb_trackid_source, acoustid_id_source
            FROM items WHERE id = ?
        `).get(trackId) as any;

        if (!row) return {};

        return {
            title: row.title_source,
            artists: row.artists_source,
            album: row.album_source,
            albumArtist: row.albumartist_source,
            year: row.year_source,
            genres: row.genres_source,
            duration: row.length_source,
            musicbrainzId: row.mb_trackid_source,
            acoustId: row.acoustid_id_source,
        };
    }

    /**
     * Inserts or updates a track in the database
     */
    private upsertTrack(track: TrackData, sources: ScoredTrackData[]): number {
        console.log('  → Building source map...');
        // Build source map
        const sourceMap: Partial<Record<keyof TrackData, DataSource>> = {};
        for (const source of sources) {
            for (const key of Object.keys(source.data)) {
                if (!sourceMap[key as keyof TrackData]) {
                    sourceMap[key as keyof TrackData] = source.source;
                }
            }
        }
        console.log('  Source map:', Object.entries(sourceMap).map(([k, v]) => `${k}=${v}`).join(', '));

        const existing = this.findTrackByPath(track.filePath);

        if (existing) {
            console.log(`  → Updating existing track (id=${existing.id})...`);
            // Update existing
            const result = this.db.prepare(`
                UPDATE items SET
                    title = ?, title_source = ?,
                    artist = ?, artists = ?, artists_source = ?,
                    album = ?, album_source = ?,
                    albumartist = ?, albumartist_source = ?,
                    year = ?, year_source = ?,
                    month = ?, day = ?,
                    track = ?, tracktotal = ?,
                    disc = ?, disctotal = ?,
                    genres = ?, genres_source = ?,
                    length = ?, length_source = ?,
                    comp = ?, label = ?, isrc = ?,
                    mb_trackid = ?, mb_trackid_source = ?,
                    acoustid_id = ?, acoustid_id_source = ?,
                    mb_albumid = ?,
                    file_hash = ?,
                    mtime = ?
                WHERE id = ?
            `).run(
                track.title, sourceMap.title,
                track.artists?.[0], JSON.stringify(track.artists), sourceMap.artists,
                track.album, sourceMap.album,
                track.albumArtist, sourceMap.albumArtist,
                track.year, sourceMap.year,
                track.month, track.day,
                track.trackNumber, track.trackTotal,
                track.discNumber, track.discTotal,
                JSON.stringify(track.genres), sourceMap.genres,
                track.duration, sourceMap.duration,
                track.compilation ? 1 : 0, track.label, track.isrc,
                track.musicbrainzId, sourceMap.musicbrainzId,
                track.acoustId, sourceMap.acoustId,
                track.releaseId,
                track.fileHash,
                Date.now(),
                existing.id
            );
            console.log(`  ✓ Updated ${result.changes} rows`);
            return existing.id;
        } else {
            console.log('  → Inserting new track...');
            // Insert new
            const result = this.db.prepare(`
                INSERT INTO items (
                    title, title_source, artist, artists, artists_source,
                    album, album_source, albumartist, albumartist_source,
                    year, year_source, month, day,
                    track, tracktotal, disc, disctotal,
                    genres, genres_source, length, length_source,
                    comp, label, isrc,
                    mb_trackid, mb_trackid_source,
                    acoustid_id, acoustid_id_source,
                    mb_albumid, file_hash, path, mtime, added
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
            `).run(
                track.title, sourceMap.title,
                track.artists?.[0], JSON.stringify(track.artists), sourceMap.artists,
                track.album, sourceMap.album,
                track.albumArtist, sourceMap.albumArtist,
                track.year, sourceMap.year,
                track.month, track.day,
                track.trackNumber, track.trackTotal,
                track.discNumber, track.discTotal,
                JSON.stringify(track.genres), sourceMap.genres,
                track.duration, sourceMap.duration,
                track.compilation ? 1 : 0, track.label, track.isrc,
                track.musicbrainzId, sourceMap.musicbrainzId,
                track.acoustId, sourceMap.acoustId,
                track.releaseId, track.fileHash,
                track.filePath, Date.now(), Date.now()
            );
            const newId = Number(result.lastInsertRowid);
            console.log(`  ✓ Inserted new track with id=${newId}`);
            return newId;
        }
    }

    /**
     * Creates or updates an album from track data
     */
    private upsertAlbum(track: TrackData): number {
        console.log(`  → Looking for existing album "${track.album}" by ${track.albumArtist}...`);
        // Find existing album by album name + albumartist
        const existing = this.db.prepare(`
            SELECT id FROM albums
            WHERE album = ? AND albumartist = ?
        `).get(track.album, track.albumArtist) as { id: number } | undefined;

        if (existing) {
            console.log(`  → Updating existing album (id=${existing.id})...`);
            // Update existing album with any new data
            // Note: artpath can be overwritten if track has newer/better cover
            const result = this.db.prepare(`
                UPDATE albums SET
                    albumartists = ?,
                    year = COALESCE(year, ?),
                    month = COALESCE(month, ?),
                    day = COALESCE(day, ?),
                    genres = COALESCE(genres, ?),
                    label = COALESCE(label, ?),
                    mb_albumid = COALESCE(mb_albumid, ?),
                    mb_releasegroupid = COALESCE(mb_releasegroupid, ?),
                    country = COALESCE(country, ?),
                    albumtype = COALESCE(albumtype, ?),
                    artpath = COALESCE(?, artpath)
                WHERE id = ?
            `).run(
                JSON.stringify(track.artists),
                track.year, track.month, track.day,
                JSON.stringify(track.genres),
                track.label,
                track.releaseId,
                track.releaseGroupId,
                track.country,
                track.albumType,
                track.coverPath,
                existing.id
            );
            console.log(`  ✓ Updated ${result.changes} rows`);
            return existing.id;
        } else {
            console.log('  → Creating new album...');
            // Create new album
            const result = this.db.prepare(`
                INSERT INTO albums (
                    album, albumartist, albumartists,
                    year, month, day,
                    genres, label,
                    mb_albumid, mb_releasegroupid,
                    country, albumtype, artpath,
                    added
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                track.album,
                track.albumArtist,
                JSON.stringify(track.artists),
                track.year, track.month, track.day,
                JSON.stringify(track.genres),
                track.label,
                track.releaseId,
                track.releaseGroupId,
                track.country,
                track.albumType,
                track.coverPath,
                Date.now()
            );
            const newId = Number(result.lastInsertRowid);
            console.log(`  ✓ Created new album with id=${newId}`);
            return newId;
        }
    }

    /**
     * Links a track to an album
     */
    private linkTrackToAlbum(trackId: number, albumId: number): void {
        this.db.prepare(`
            UPDATE items SET album_id = ? WHERE id = ?
        `).run(albumId, trackId);
    }

    /**
     * Stores conflicts in database
     */
    private storeConflicts(conflicts: SyncConflict[]): void {
        const stmt = this.db.prepare(`
            INSERT INTO sync_conflicts (track_id, field, db_value, db_source, file_value, mb_value, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const conflict of conflicts) {
            stmt.run(
                conflict.trackId,
                conflict.field,
                JSON.stringify(conflict.dbValue),
                conflict.dbSource,
                JSON.stringify(conflict.fileValue),
                conflict.mbValue ? JSON.stringify(conflict.mbValue) : null,
                conflict.timestamp.getTime()
            );
        }
    }
}

export * from './types';
export { mergeTrackData } from './merger';
export { syncTrack, resolveConflict, getTrackConflicts } from './sync';
