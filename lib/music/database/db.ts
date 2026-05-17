import Database from "better-sqlite3"
import { globalConfig } from "@/lib/config"
import fs from "fs"
import path from "path"

// Initialize database with schema
function initializeDatabase(dbPath: string): Database.Database {
    // Check if database file exists
    const dbExists = fs.existsSync(dbPath)

    const db = new Database(dbPath)

    // Enable foreign keys
    db.pragma("foreign_keys = ON")

    // If database doesn't exist or tables are missing, create schema
    if (!dbExists || !hasRequiredTables(db)) {
        createSchema(db)
    }

    // Run any pending migrations
    runMigrations(db)

    return db
}

function hasRequiredTables(db: Database.Database): boolean {
    const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as Array<{ name: string }>

    const requiredTables = ["albums", "items", "album_attributes", "item_attributes", "sync_conflicts"]
    return requiredTables.every(table =>
        tables.some(t => t.name === table)
    )
}

function runMigrations(db: Database.Database): void {
    console.log("Checking for pending migrations...")

    // Ensure migrations table exists
    db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
            name TEXT NOT NULL,
            table_name TEXT NOT NULL,
            PRIMARY KEY(name, table_name)
        )
    `)

    // Migration 1: Add source tracking columns to items table
    const migration1Name = "add_source_columns"
    const hasMigration1 = db.prepare(
        "SELECT 1 FROM migrations WHERE name = ? AND table_name = 'items'"
    ).get(migration1Name)

    if (!hasMigration1) {
        console.log("Running migration: add_source_columns")

        // Check which columns are missing
        const columns = db.prepare("PRAGMA table_info(items)").all() as Array<{ name: string }>
        const columnNames = columns.map(c => c.name)

        const sourceColumns = [
            'title_source',
            'artist_source',
            'artists_source',
            'album_source',
            'albumartist_source',
            'year_source',
            'month_source',
            'day_source',
            'genres_source',
            'length_source',
            'mb_trackid_source',
            'acoustid_id_source'
        ]

        // Add missing columns
        for (const col of sourceColumns) {
            if (!columnNames.includes(col)) {
                console.log(`  Adding column: ${col}`)
                db.exec(`ALTER TABLE items ADD COLUMN ${col} TEXT`)
            }
        }

        // Check for file_hash, missing_since, and artpath columns
        if (!columnNames.includes('file_hash')) {
            console.log("  Adding column: file_hash")
            db.exec("ALTER TABLE items ADD COLUMN file_hash TEXT")
        }
        if (!columnNames.includes('missing_since')) {
            console.log("  Adding column: missing_since")
            db.exec("ALTER TABLE items ADD COLUMN missing_since REAL")
        }
        if (!columnNames.includes('artpath')) {
            console.log("  Adding column: artpath")
            db.exec("ALTER TABLE items ADD COLUMN artpath BLOB")
        }

        // Mark migration as complete
        db.prepare("INSERT INTO migrations (name, table_name) VALUES (?, 'items')").run(migration1Name)
        console.log("Migration complete: add_source_columns")
    }

    // Migration 2: Add artpath column to items table
    const migration2Name = "add_artpath_to_items"
    const hasMigration2 = db.prepare(
        "SELECT 1 FROM migrations WHERE name = ? AND table_name = 'items'"
    ).get(migration2Name)

    if (!hasMigration2) {
        console.log("Running migration: add_artpath_to_items")

        const columns = db.prepare("PRAGMA table_info(items)").all() as Array<{ name: string }>
        const columnNames = columns.map(c => c.name)

        if (!columnNames.includes('artpath')) {
            console.log("  Adding column: artpath")
            db.exec("ALTER TABLE items ADD COLUMN artpath BLOB")
        } else {
            console.log("  Column artpath already exists")
        }

        // Mark migration as complete
        db.prepare("INSERT INTO migrations (name, table_name) VALUES (?, 'items')").run(migration2Name)
        console.log("Migration complete: add_artpath_to_items")
    }
}

function createSchema(db: Database.Database): void {
    console.log("Creating database schema...")

    db.exec(`
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
            artpath BLOB,
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
            added REAL
        );

        -- Items (tracks) table
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY,
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
            path BLOB,
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
            artpath BLOB,
            file_hash TEXT,
            missing_since REAL,
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
