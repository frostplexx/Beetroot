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
import { writeTagsToFile } from './writeback';
import { albumArtManager } from './albumart';

export class TrackRepository {
    constructor(private db: Database.Database) { }

    /**
     * Imports a track from file tags, optionally enriching with MusicBrainz/Last.fm
     */
    async importTrack(
        filePath: string,
        options: ImportOptions = {}
    ): Promise<{ trackId: number; conflicts: SyncConflict[] }> {
        const {
            skipMusicBrainz = false,
            skipLastFm = false,
            writeBack = 'never',
            conflictResolution = 'keep-db'
        } = options;

        // Check if track already exists
        const existingTrack = this.findTrackByPath(filePath);

        // Gather data from sources
        const sources: ScoredTrackData[] = [];

        // 1. Read local tags (always)
        const localTags = await readLocalTags(filePath);
        sources.push(localTags);

        // 2. Fetch MusicBrainz data (optional)
        if (!skipMusicBrainz && localTags.data.duration) {
            try {
                const chromaprint = await getAcoustidFingerprint(filePath);
                const mbData = await fetchMusicBrainzData(
                    filePath,
                    chromaprint.fingerprint,
                    chromaprint.duration
                );
                if (mbData) {
                    sources.push(mbData);
                }
            } catch (error) {
                console.warn('Failed to fetch MusicBrainz data:', error);
            }
        }

        // 3. Fetch Last.fm genres (optional)
        if (!skipLastFm && localTags.data.artists?.[0] && localTags.data.album) {
            const lfmGenres = await fetchLastFmGenres(
                localTags.data.artists[0],
                localTags.data.album,
                filePath
            );
            if (lfmGenres) {
                sources.push(lfmGenres);
            }
        }

        // Merge data
        const existingData = existingTrack ? this.getTrackData(existingTrack.id) : undefined;
        const existingSources = existingTrack ? this.getTrackSources(existingTrack.id) : undefined;

        const { merged, conflicts: mergeConflicts } = mergeTrackData(
            sources,
            existingData,
            existingSources,
            conflictResolution
        );

        // Upsert to database
        const trackId = this.upsertTrack(merged, sources);

        // Store conflicts
        const conflicts = mergeConflicts.map(c => ({
            ...c,
            trackId,
            timestamp: new Date(),
        }));

        if (conflicts.length > 0) {
            this.storeConflicts(conflicts);
        }

        // Fetch and save album art
        try {
            const albumFolder = albumArtManager.getAlbumFolder(filePath);
            const coverPath = await albumArtManager.fetchAndSave(
                {
                    filePath,
                    releaseId: merged.releaseId,
                    artist: merged.artists?.[0] || merged.albumArtist,
                    album: merged.album
                },
                albumFolder,
                { minWidth: 300, minHeight: 300 }
            );

            if (coverPath) {
                // Update track with cover path
                merged.coverPath = coverPath;
                this.updateCoverPath(trackId, coverPath);
            }
        } catch (error) {
            // Don't abort import if album art fails
            console.warn('Album art fetch failed (non-critical):', error);
        }

        // Write back to file if requested
        if (writeBack === 'always' || (writeBack === 'missing-only' && !existingTrack)) {
            try {
                await writeTagsToFile(filePath, merged);
            } catch (error) {
                console.error('Write-back failed:', error);
                throw error; // Abort import on write-back failure
            }
        }

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
        // Build source map
        const sourceMap: Partial<Record<keyof TrackData, DataSource>> = {};
        for (const source of sources) {
            for (const key of Object.keys(source.data)) {
                if (!sourceMap[key as keyof TrackData]) {
                    sourceMap[key as keyof TrackData] = source.source;
                }
            }
        }

        const existing = this.findTrackByPath(track.filePath);

        if (existing) {
            // Update existing
            this.db.prepare(`
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
            return existing.id;
        } else {
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
            return Number(result.lastInsertRowid);
        }
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
