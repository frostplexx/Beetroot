import { Database } from "bun:sqlite"
import { globalConfig } from "../../config"
import { normalizeAlbumString } from "./normalize"
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

    // Run migrations for existing databases
    runMigrations(db)

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
            missing_since REAL,
            album_normalized TEXT,
            albumartist_normalized TEXT
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
        CREATE INDEX IF NOT EXISTS album_mb_releasegroupid ON albums(mb_releasegroupid);
        CREATE INDEX IF NOT EXISTS idx_album_normalized ON albums(album_normalized, albumartist_normalized, year);

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

function runMigrations(db: Database): void {
    // Migration: Add normalized columns to albums table
    const migrationName = 'add_album_normalized_columns';
    const existing = db.prepare(
        'SELECT 1 FROM migrations WHERE name = ? AND table_name = ?'
    ).get(migrationName, 'albums');

    if (!existing) {
        console.log('Running migration: add normalized columns to albums...');

        // Check if columns already exist (in case schema was just created)
        const tableInfo = db.prepare('PRAGMA table_info(albums)').all() as Array<{ name: string }>;
        const hasNormalizedColumns = tableInfo.some(col => col.name === 'album_normalized');

        if (!hasNormalizedColumns) {
            // Add columns
            db.run('ALTER TABLE albums ADD COLUMN album_normalized TEXT');
            db.run('ALTER TABLE albums ADD COLUMN albumartist_normalized TEXT');

            // Create index
            db.run('CREATE INDEX IF NOT EXISTS idx_album_normalized ON albums(album_normalized, albumartist_normalized, year)');
        }

        // Backfill NULL album names with 'Unknown Album'
        db.run("UPDATE albums SET album = 'Unknown Album' WHERE album IS NULL OR album = ''");

        // Backfill normalized values for existing albums
        const albums = db.prepare('SELECT id, album, albumartist FROM albums').all() as Array<{
            id: number;
            album: string | null;
            albumartist: string | null;
        }>;

        const updateStmt = db.prepare(
            'UPDATE albums SET album_normalized = ?, albumartist_normalized = ? WHERE id = ?'
        );

        for (const album of albums) {
            updateStmt.run(
                normalizeAlbumString(album.album),
                normalizeAlbumString(album.albumartist),
                album.id
            );
        }

        // Record migration
        db.prepare('INSERT INTO migrations (name, table_name) VALUES (?, ?)').run( migrationName, 'albums');

        console.log(`Migration complete: backfilled ${albums.length} albums with normalized values`);
    }

    // Migration: index on mb_releasegroupid for the new match cascade
    const rgIndexMigration = 'add_mb_releasegroupid_index';
    const rgIndexExists = db.prepare(
        'SELECT 1 FROM migrations WHERE name = ? AND table_name = ?'
    ).get(rgIndexMigration, 'albums');
    if (!rgIndexExists) {
        db.run('CREATE INDEX IF NOT EXISTS album_mb_releasegroupid ON albums(mb_releasegroupid)');
        db.prepare('INSERT INTO migrations (name, table_name) VALUES (?, ?)').run( rgIndexMigration, 'albums');
    }

    // Migration: Create FTS tables for full-text search
    const ftsMigration = 'create_fts_tables';
    const ftsExists = db.prepare(
        'SELECT 1 FROM migrations WHERE name = ?'
    ).get(ftsMigration);
    if (!ftsExists) {
        console.log('Running migration: create FTS tables...');

        // Create FTS virtual table for albums with unicode61 tokenizer
        // remove_diacritics=2 removes all diacritics (accents) for fuzzy matching
        db.run(`
            CREATE VIRTUAL TABLE IF NOT EXISTS albums_fts USING fts4(
                album,
                albumartist,
                label,
                genres,
                content="albums",
                tokenize=unicode61 "remove_diacritics=2"
            )
        `);

        // Create FTS virtual table for items with unicode61 tokenizer
        db.run(`
            CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts4(
                title,
                artist,
                album,
                content="items",
                tokenize=unicode61 "remove_diacritics=2"
            )
        `);

        // Create triggers to keep albums FTS in sync
        db.run(`
            CREATE TRIGGER albums_fts_insert AFTER INSERT ON albums BEGIN
                INSERT INTO albums_fts(docid, album, albumartist, label, genres)
                VALUES (new.id, new.album, new.albumartist, new.label, new.genres);
            END
        `);

        db.run(`
            CREATE TRIGGER albums_fts_update AFTER UPDATE ON albums BEGIN
                UPDATE albums_fts SET
                    album = new.album,
                    albumartist = new.albumartist,
                    label = new.label,
                    genres = new.genres
                WHERE docid = old.id;
            END
        `);

        db.run(`
            CREATE TRIGGER albums_fts_delete AFTER DELETE ON albums BEGIN
                DELETE FROM albums_fts WHERE docid = old.id;
            END
        `);

        // Create triggers to keep items FTS in sync
        db.run(`
            CREATE TRIGGER items_fts_insert AFTER INSERT ON items BEGIN
                INSERT INTO items_fts(docid, title, artist, album)
                VALUES (new.id, new.title, new.artist, new.album);
            END
        `);

        db.run(`
            CREATE TRIGGER items_fts_update AFTER UPDATE ON items BEGIN
                UPDATE items_fts SET
                    title = new.title,
                    artist = new.artist,
                    album = new.album
                WHERE docid = old.id;
            END
        `);

        db.run(`
            CREATE TRIGGER items_fts_delete AFTER DELETE ON items BEGIN
                DELETE FROM items_fts WHERE docid = old.id;
            END
        `);

        // Populate FTS tables with existing data
        db.run(`
            INSERT INTO albums_fts(docid, album, albumartist, label, genres)
            SELECT id, album, albumartist, label, genres FROM albums
        `);

        db.run(`
            INSERT INTO items_fts(docid, title, artist, album)
            SELECT id, title, artist, album FROM items
        `);

        // Record migration
        db.prepare('INSERT INTO migrations (name, table_name) VALUES (?, ?)').run( ftsMigration, 'fts');

        console.log('Migration complete: FTS tables created and populated');
    }

    // Migration: Use FTS5 with porter tokenizer wrapping unicode61 with diacritic removal
    // FTS5 is better than FTS4 in every way - faster, more efficient, better features
    const ftsUnicodeMigration = 'fts5_with_porter_unicode61';
    const ftsUnicodeExists = db.prepare(
        'SELECT 1 FROM migrations WHERE name = ?'
    ).get(ftsUnicodeMigration);
    if (!ftsUnicodeExists) {
        console.log('Running migration: creating FTS5 tables with porter + unicode61...');

        // Drop existing FTS tables and triggers
        db.run('DROP TRIGGER IF EXISTS albums_fts_insert');
        db.run('DROP TRIGGER IF EXISTS albums_fts_update');
        db.run('DROP TRIGGER IF EXISTS albums_fts_delete');
        db.run('DROP TRIGGER IF EXISTS items_fts_insert');
        db.run('DROP TRIGGER IF EXISTS items_fts_update');
        db.run('DROP TRIGGER IF EXISTS items_fts_delete');
        db.run('DROP TABLE IF EXISTS albums_fts');
        db.run('DROP TABLE IF EXISTS items_fts');

        // Create FTS5 tables with porter wrapping unicode61
        // Porter does stemming (legend→legends), unicode61 removes diacritics (á→a)
        db.run(`
            CREATE VIRTUAL TABLE albums_fts USING fts5(
                album,
                albumartist,
                label,
                genres,
                content=albums,
                content_rowid=id,
                tokenize="porter unicode61 remove_diacritics 2"
            )
        `);

        db.run(`
            CREATE VIRTUAL TABLE items_fts USING fts5(
                title,
                artist,
                album,
                content=items,
                content_rowid=id,
                tokenize="porter unicode61 remove_diacritics 2"
            )
        `);

        // Create triggers to keep FTS5 index in sync
        // FTS5 external content tables use special commands for updates
        db.run(`
            CREATE TRIGGER albums_fts_insert AFTER INSERT ON albums BEGIN
                INSERT INTO albums_fts(rowid, album, albumartist, label, genres)
                VALUES (new.id, new.album, new.albumartist, new.label, new.genres);
            END
        `);

        db.run(`
            CREATE TRIGGER albums_fts_update AFTER UPDATE ON albums BEGIN
                INSERT INTO albums_fts(albums_fts, rowid, album, albumartist, label, genres)
                VALUES('delete', old.id, old.album, old.albumartist, old.label, old.genres);
                INSERT INTO albums_fts(rowid, album, albumartist, label, genres)
                VALUES (new.id, new.album, new.albumartist, new.label, new.genres);
            END
        `);

        db.run(`
            CREATE TRIGGER albums_fts_delete AFTER DELETE ON albums BEGIN
                INSERT INTO albums_fts(albums_fts, rowid, album, albumartist, label, genres)
                VALUES('delete', old.id, old.album, old.albumartist, old.label, old.genres);
            END
        `);

        db.run(`
            CREATE TRIGGER items_fts_insert AFTER INSERT ON items BEGIN
                INSERT INTO items_fts(rowid, title, artist, album)
                VALUES (new.id, new.title, new.artist, new.album);
            END
        `);

        db.run(`
            CREATE TRIGGER items_fts_update AFTER UPDATE ON items BEGIN
                INSERT INTO items_fts(items_fts, rowid, title, artist, album)
                VALUES('delete', old.id, old.title, old.artist, old.album);
                INSERT INTO items_fts(rowid, title, artist, album)
                VALUES (new.id, new.title, new.artist, new.album);
            END
        `);

        db.run(`
            CREATE TRIGGER items_fts_delete AFTER DELETE ON items BEGIN
                INSERT INTO items_fts(items_fts, rowid, title, artist, album)
                VALUES('delete', old.id, old.title, old.artist, old.album);
            END
        `);

        // Populate FTS5 tables - the tokenizer handles everything automatically
        db.run(`
            INSERT INTO albums_fts(rowid, album, albumartist, label, genres)
            SELECT id, album, albumartist, label, genres FROM albums
        `);

        db.run(`
            INSERT INTO items_fts(rowid, title, artist, album)
            SELECT id, title, artist, album FROM items
        `);

        // Record migration
        db.prepare('INSERT INTO migrations (name, table_name) VALUES (?, ?)').run( ftsUnicodeMigration, 'fts');

        console.log('Migration complete: FTS tables rebuilt with unicode61 tokenizer');
    }
}

// Ensure the database directory exists
const dbDir = path.dirname(globalConfig.database_path)
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
}

const db = initializeDatabase(globalConfig.database_path)

export default db
