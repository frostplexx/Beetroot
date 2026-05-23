import { Database } from "bun:sqlite"
import { globalConfig } from "../../config"
import * as fs from "fs"
import * as path from "path"

// Initialize database with schema
function initializeDatabase(dbPath: string): Database {
    // Check if database file exists
    const dbExists = fs.existsSync(dbPath)

    const db = new Database(dbPath)

    // Enable foreign keys
    db.run("PRAGMA foreign_keys = ON")

    // WAL mode lets readers proceed while the reconcile service is writing.
    db.run("PRAGMA journal_mode = WAL")
    db.run("PRAGMA synchronous = NORMAL")
    db.run("PRAGMA busy_timeout = 5000")

    // If database doesn't exist or tables are missing, create schema
    if (!dbExists || !hasRequiredTables(db)) {
        createSchema(db)
    }

    return db
}

function hasRequiredTables(db: Database): boolean {
    const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as Array<{ name: string }>

    const requiredTables = ["albums", "items", "album_attributes", "item_attributes", "sync_conflicts"]
    return requiredTables.every(table =>
        tables.some(t => t.name === table)
    )
}

function createSchema(db: Database): void {
    console.log("Creating database schema...")

    db.run(`
        -- Albums table
        CREATE TABLE IF NOT EXISTS albums (
            id INTEGER PRIMARY KEY,
            album TEXT,
            albumartist TEXT,
            albumartist_credit TEXT,
            albumartists TEXT,
            albumartists_credit TEXT,
            albumartist_sort TEXT,
            albumartists_sort TEXT,
            albumdisambig TEXT,
            albumstatus TEXT,
            albumtype TEXT,
            albumtypes TEXT,
            artpath TEXT,
            asin TEXT,
            barcode TEXT,
            catalognum TEXT,
            comp INTEGER,
            country TEXT,
            day INTEGER,
            discogs_albumid INTEGER,
            discogs_artistid INTEGER,
            discogs_labelid INTEGER,
            disctotal INTEGER,
            genres TEXT,
            label TEXT,
            language TEXT,
            mb_albumartistid TEXT,
            mb_albumartistids TEXT,
            mb_albumid TEXT,
            mb_releasegroupid TEXT,
            month INTEGER,
            original_day INTEGER,
            original_month INTEGER,
            original_year INTEGER,
            r128_album_gain REAL,
            releasegroupdisambig TEXT,
            release_group_title TEXT,
            rg_album_gain REAL,
            rg_album_peak REAL,
            script TEXT,
            style TEXT,
            year INTEGER,
            added REAL,
            missing_since REAL
        );

        -- Items (tracks) table
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY,
            source TEXT,
            title TEXT,
            artist TEXT,
            artist_credit TEXT,
            artists TEXT,
            artists_credit TEXT,
            artist_sort TEXT,
            artists_sort TEXT,
            artists_ids TEXT,
            album TEXT,
            albumartist TEXT,
            albumartist_credit TEXT,
            albumartists TEXT,
            albumartists_credit TEXT,
            albumartist_sort TEXT,
            albumartists_sort TEXT,
            albumdisambig TEXT,
            albumstatus TEXT,
            albumtype TEXT,
            albumtypes TEXT,
            album_id INTEGER,
            acoustid_fingerprint TEXT,
            acoustid_id TEXT,
            arrangers TEXT,
            arrangers_ids TEXT,
            asin TEXT,
            barcode TEXT,
            bitdepth INTEGER,
            bitrate INTEGER,
            bitrate_mode TEXT,
            bpm INTEGER,
            catalognum TEXT,
            channels INTEGER,
            comments TEXT,
            comp INTEGER,
            composer_sort TEXT,
            composers TEXT,
            composers_ids TEXT,
            country TEXT,
            day INTEGER,
            disc INTEGER,
            discogs_albumid INTEGER,
            discogs_artistid INTEGER,
            discogs_labelid INTEGER,
            disctitle TEXT,
            disctotal INTEGER,
            encoder TEXT,
            encoder_info TEXT,
            encoder_settings TEXT,
            format TEXT,
            genres TEXT,
            grouping TEXT,
            subtitle TEXT,
            initial_key TEXT,
            isrc TEXT,
            label TEXT,
            language TEXT,
            length REAL,
            lyricists TEXT,
            lyricists_ids TEXT,
            lyrics TEXT,
            mb_albumartistid TEXT,
            mb_albumartistids TEXT,
            mb_albumid TEXT,
            mb_artistid TEXT,
            mb_artistids TEXT,
            mb_releasegroupid TEXT,
            mb_releasetrackid TEXT,
            mb_trackid TEXT,
            mb_workid TEXT,
            media TEXT,
            month INTEGER,
            mtime REAL,
            original_day INTEGER,
            original_month INTEGER,
            original_year INTEGER,
            path TEXT,
            r128_album_gain REAL,
            r128_track_gain REAL,
            releasegroupdisambig TEXT,
            release_group_title TEXT,
            remixers TEXT,
            remixers_ids TEXT,
            rg_album_gain REAL,
            rg_album_peak REAL,
            rg_track_gain REAL,
            rg_track_peak REAL,
            samplerate INTEGER,
            script TEXT,
            style TEXT,
            track INTEGER,
            trackdisambig TEXT,
            tracktotal INTEGER,
            work TEXT,
            work_disambig TEXT,
            year INTEGER,
            added REAL,
            artpath TEXT,
            file_hash TEXT,
            missing_since REAL,
            marked_for_deletion REAL,
            title_source TEXT,
            artist_source TEXT,
            artists_source TEXT,
            album_source TEXT,
            albumartist_source TEXT,
            year_source TEXT,
            month_source TEXT,
            day_source TEXT,
            genres_source TEXT,
            length_source TEXT,
            mb_trackid_source TEXT,
            acoustid_id_source TEXT,
            FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE SET NULL
        );

        -- Flexible attributes for albums
        CREATE TABLE IF NOT EXISTS album_attributes (
            id INTEGER PRIMARY KEY,
            entity_id INTEGER,
            key TEXT,
            value TEXT,
            UNIQUE(entity_id, key) ON CONFLICT REPLACE,
            FOREIGN KEY (entity_id) REFERENCES albums(id) ON DELETE CASCADE
        );

        -- Flexible attributes for items
        CREATE TABLE IF NOT EXISTS item_attributes (
            id INTEGER PRIMARY KEY,
            entity_id INTEGER,
            key TEXT,
            value TEXT,
            UNIQUE(entity_id, key) ON CONFLICT REPLACE,
            FOREIGN KEY (entity_id) REFERENCES items(id) ON DELETE CASCADE
        );

        -- Sync conflicts table
        CREATE TABLE IF NOT EXISTS sync_conflicts (
            id INTEGER PRIMARY KEY,
            track_id INTEGER NOT NULL,
            field TEXT NOT NULL,
            db_value TEXT,
            db_source TEXT,
            file_value TEXT,
            mb_value TEXT,
            timestamp REAL NOT NULL,
            FOREIGN KEY (track_id) REFERENCES items(id) ON DELETE CASCADE
        );

        -- Migrations tracking table
        CREATE TABLE IF NOT EXISTS migrations (
            name TEXT NOT NULL,
            table_name TEXT NOT NULL,
            PRIMARY KEY(name, table_name)
        );

        -- Indices for albums
        CREATE INDEX IF NOT EXISTS album_album ON albums(album);
        CREATE INDEX IF NOT EXISTS album_albumartist ON albums(albumartist);
        CREATE INDEX IF NOT EXISTS album_added ON albums(added);
        CREATE INDEX IF NOT EXISTS album_mb_albumid ON albums(mb_albumid);

        -- Indices for items
        CREATE INDEX IF NOT EXISTS idx_item_album_id ON items(album_id);
        CREATE INDEX IF NOT EXISTS item_title ON items(title);
        CREATE INDEX IF NOT EXISTS item_artist ON items(artist);
        CREATE INDEX IF NOT EXISTS item_album ON items(album);
        CREATE INDEX IF NOT EXISTS item_albumartist ON items(albumartist);
        CREATE INDEX IF NOT EXISTS item_path ON items(path);
        CREATE INDEX IF NOT EXISTS item_mb_trackid ON items(mb_trackid);
        CREATE INDEX IF NOT EXISTS item_file_hash ON items(file_hash);

        -- Partial indices for cleanup queries (D6)
        CREATE INDEX IF NOT EXISTS idx_marked_for_deletion ON items(marked_for_deletion) WHERE marked_for_deletion IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_missing_since ON items(missing_since) WHERE missing_since IS NOT NULL;

        -- Indices for flexible attributes
        CREATE INDEX IF NOT EXISTS album_attributes_by_entity ON album_attributes(entity_id);
        CREATE INDEX IF NOT EXISTS item_attributes_by_entity ON item_attributes(entity_id);

        -- Indices for sync conflicts
        CREATE INDEX IF NOT EXISTS sync_conflicts_track_id ON sync_conflicts(track_id);
        CREATE INDEX IF NOT EXISTS sync_conflicts_field ON sync_conflicts(field);
    `)

    console.log("Database schema created successfully")
}

// Ensure the database directory exists
const dbDir = path.dirname(globalConfig.database_path)
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
}

const db = initializeDatabase(globalConfig.database_path)

export default db
