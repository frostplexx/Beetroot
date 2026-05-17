// Data source types
export type DataSource = 'tags' | 'musicbrainz' | 'lastfm' | 'database' | 'user';
export type SyncStatus = 'ok' | 'updated' | 'conflict' | 'missing';
export type WriteBackMode = 'always' | 'never' | 'missing-only';
export type ConflictResolution = 'keep-db' | 'keep-file' | 'keep-mb' | 'manual';

// Core track data interface
export interface TrackData {
    // Basic metadata
    title?: string;
    artists?: string[];
    album?: string;
    albumArtist?: string;

    // Track/disc info
    trackNumber?: number;
    trackTotal?: number;
    discNumber?: number;
    discTotal?: number;

    // Dates
    date?: Date;
    year?: number;
    month?: number;
    day?: number;
    originalYear?: number;
    originalMonth?: number;
    originalDay?: number;

    // Album info
    compilation?: boolean;
    label?: string;

    // Genres
    genres?: string[];

    // Audio properties
    duration?: number; // in seconds

    // Identifiers
    musicbrainzId?: string; // recording ID
    acoustId?: string;
    acoustIdScore?: number;
    releaseId?: string; // MusicBrainz release ID
    releaseTitle?: string;
    releaseCountry?: string;
    releaseStatus?: string;
    artistIds?: string[]; // MusicBrainz artist IDs
    isrc?: string;

    // File info
    filePath: string;
    fileHash?: string; // MD5 of first 128KB

    // Lyrics (pass-through, not stored in DB)
    lyrics?: string;

    // Cover art (path only, image stored on disk)
    coverPath?: string;
}

// Track data with confidence score from a source
export interface ScoredTrackData {
    data: Partial<TrackData>;
    confidence: number; // 0-1
    source: DataSource;
}

// Conflict between different sources
export interface SyncConflict {
    trackId: number;
    field: keyof TrackData;
    dbValue: unknown;
    dbSource: DataSource;
    fileValue: unknown;
    mbValue?: unknown;
    timestamp: Date;
}

// Result of sync operation
export interface SyncResult {
    status: SyncStatus;
    conflicts?: SyncConflict[];
    updated?: Partial<TrackData>;
}

// Result of write-back operation
export interface WriteBackResult {
    status: 'ok' | 'skipped' | 'error';
    reason?: string;
    error?: Error;
}

// Album art metadata
export type AlbumArtSource = 'embedded' | 'coverartarchive' | 'itunes' | 'spotify';

export interface AlbumArt {
    buffer: Buffer;
    mimeType: 'image/jpeg' | 'image/png';
    source: AlbumArtSource;
    quality?: 'high' | 'medium' | 'low';
    width?: number;
    height?: number;
    url?: string; // Original URL if fetched from web
}

export interface AlbumArtOptions {
    preferredSources?: AlbumArtSource[];
    minWidth?: number;
    minHeight?: number;
    saveToFile?: boolean;
}

// Track with source information per field
export interface TrackedTrack extends TrackData {
    id: number;
    sources: Partial<Record<keyof TrackData, DataSource>>;
    missingSince?: Date;
}

// Import options
export interface ImportOptions {
    skipMusicBrainz?: boolean;
    skipLastFm?: boolean;
    writeBack?: WriteBackMode;
    conflictResolution?: ConflictResolution;
}
