import { TrackData, SyncResult, SyncConflict, DataSource } from './types';
import { readLocalTags } from './sources/tags';
import Database from 'better-sqlite3';

/**
 * Compares database track with file tags and detects conflicts
 */
export async function syncTrack(
    db: Database.Database,
    trackId: number,
    filePath: string
): Promise<SyncResult> {
    // Get current database state
    const dbTrack = getDbTrack(db, trackId);
    if (!dbTrack) {
        return { status: 'missing' };
    }

    // Read current file tags
    const fileTagsScored = await readLocalTags(filePath);
    const fileTags = fileTagsScored.data;

    // Compare fields and detect conflicts
    const conflicts: SyncConflict[] = [];
    const updated: Partial<TrackData> = {};

    const fieldsToCheck: Array<keyof TrackData> = [
        'title',
        'artists',
        'album',
        'albumArtist',
        'year',
        'trackNumber',
        'genres',
        'duration',
    ];

    for (const field of fieldsToCheck) {
        const dbValue = dbTrack[field];
        const fileValue = fileTags[field];

        // Skip if both are undefined or null
        if (dbValue === undefined && fileValue === undefined) continue;
        if (dbValue === null && fileValue === null) continue;

        // Compare values
        if (!areValuesEqual(dbValue, fileValue)) {
            const dbSource = getFieldSource(db, trackId, field);

            // If DB source is 'user', file changes are conflicts
            if (dbSource === 'user') {
                conflicts.push({
                    trackId,
                    field,
                    dbValue,
                    dbSource,
                    fileValue,
                    timestamp: new Date(),
                });
            } else {
                // Otherwise, update from file
                (updated as any)[field] = fileValue;
            }
        }
    }

    // Store conflicts in database
    if (conflicts.length > 0) {
        storeConflicts(db, conflicts);
        return { status: 'conflict', conflicts, updated };
    }

    if (Object.keys(updated).length > 0) {
        return { status: 'updated', updated };
    }

    return { status: 'ok' };
}

/**
 * Resolves a sync conflict
 */
export function resolveConflict(
    db: Database.Database,
    conflictId: number,
    resolution: 'db' | 'file' | 'mb' | 'custom',
    customValue?: unknown
): void {
    const conflict = db.prepare(`
        SELECT * FROM sync_conflicts WHERE id = ?
    `).get(conflictId) as any;

    if (!conflict) {
        throw new Error(`Conflict ${conflictId} not found`);
    }

    let valueToUse: unknown;
    let source: DataSource;

    switch (resolution) {
        case 'db':
            valueToUse = JSON.parse(conflict.db_value);
            source = conflict.db_source;
            break;
        case 'file':
            valueToUse = JSON.parse(conflict.file_value);
            source = 'tags';
            break;
        case 'mb':
            if (!conflict.mb_value) {
                throw new Error('No MusicBrainz value available for this conflict');
            }
            valueToUse = JSON.parse(conflict.mb_value);
            source = 'musicbrainz';
            break;
        case 'custom':
            valueToUse = customValue;
            source = 'user';
            break;
    }

    // Update track with resolved value
    updateTrackField(db, conflict.track_id, conflict.field, valueToUse, source);

    // Delete conflict
    db.prepare('DELETE FROM sync_conflicts WHERE id = ?').run(conflictId);
}

/**
 * Gets track data from database
 */
function getDbTrack(db: Database.Database, trackId: number): Partial<TrackData> | null {
    const row = db.prepare(`
        SELECT
            title, artist, artists, album, albumartist,
            year, track as trackNumber, disc as discNumber,
            genres, length as duration, path as filePath,
            mb_trackid as musicbrainzId, acoustid_id as acoustId,
            mb_albumid as releaseId
        FROM items WHERE id = ?
    `).get(trackId) as any;

    if (!row) return null;

    return {
        title: row.title,
        artists: row.artists ? JSON.parse(row.artists) : [row.artist],
        album: row.album,
        albumArtist: row.albumartist,
        year: row.year,
        trackNumber: row.trackNumber,
        discNumber: row.discNumber,
        genres: row.genres ? JSON.parse(row.genres) : [],
        duration: row.duration,
        filePath: row.filePath,
        musicbrainzId: row.musicbrainzId,
        acoustId: row.acoustId,
        releaseId: row.releaseId,
    };
}

/**
 * Gets the source of a field value
 */
function getFieldSource(db: Database.Database, trackId: number, field: keyof TrackData): DataSource {
    const sourceField = `${field}_source`;
    const row = db.prepare(`
        SELECT ${sourceField} as source FROM items WHERE id = ?
    `).get(trackId) as any;

    return (row?.source || 'database') as DataSource;
}

/**
 * Updates a track field with its source
 */
function updateTrackField(
    db: Database.Database,
    trackId: number,
    field: string,
    value: unknown,
    source: DataSource
): void {
    const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);

    db.prepare(`
        UPDATE items
        SET ${field} = ?, ${field}_source = ?
        WHERE id = ?
    `).run(serializedValue, source, trackId);
}

/**
 * Stores conflicts in the database
 */
function storeConflicts(db: Database.Database, conflicts: SyncConflict[]): void {
    const stmt = db.prepare(`
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

/**
 * Compares two values for equality (handles arrays and objects)
 */
function areValuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (a === undefined || b === undefined) return false;

    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((val, idx) => areValuesEqual(val, b[idx]));
    }

    // Handle objects
    if (typeof a === 'object' && typeof b === 'object') {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    return false;
}

/**
 * Gets all unresolved conflicts for a track
 */
export function getTrackConflicts(db: Database.Database, trackId: number): SyncConflict[] {
    const rows = db.prepare(`
        SELECT * FROM sync_conflicts WHERE track_id = ?
    `).all(trackId) as any[];

    return rows.map(row => ({
        trackId: row.track_id,
        field: row.field,
        dbValue: JSON.parse(row.db_value),
        dbSource: row.db_source,
        fileValue: JSON.parse(row.file_value),
        mbValue: row.mb_value ? JSON.parse(row.mb_value) : undefined,
        timestamp: new Date(row.timestamp),
    }));
}
