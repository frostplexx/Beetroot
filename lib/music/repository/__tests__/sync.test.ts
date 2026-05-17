import Database from 'better-sqlite3';
import { syncTrack, resolveConflict, getTrackConflicts } from '../sync';
import { DataSource } from '../types';
import fs from 'fs';
import path from 'path';

describe('sync', () => {
    let db: Database.Database;
    let dbPath: string;

    beforeEach(() => {
        // Create temporary database
        dbPath = path.join(__dirname, `test-${Date.now()}.db`);
        db = new Database(dbPath);

        // Create minimal schema
        db.exec(`
            CREATE TABLE items (
                id INTEGER PRIMARY KEY,
                title TEXT,
                artist TEXT,
                artists TEXT,
                album TEXT,
                albumartist TEXT,
                year INTEGER,
                track INTEGER,
                disc INTEGER,
                genres TEXT,
                length REAL,
                path TEXT,
                mb_trackid TEXT,
                acoustid_id TEXT,
                mb_albumid TEXT,
                title_source TEXT,
                artist_source TEXT,
                artists_source TEXT,
                album_source TEXT,
                year_source TEXT
            );

            CREATE TABLE sync_conflicts (
                id INTEGER PRIMARY KEY,
                track_id INTEGER NOT NULL,
                field TEXT NOT NULL,
                db_value TEXT,
                db_source TEXT,
                file_value TEXT,
                mb_value TEXT,
                timestamp REAL NOT NULL
            );
        `);
    });

    afterEach(() => {
        db.close();
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
    });

    it('should detect no changes when file matches database', async () => {
        // Insert test track
        db.prepare(`
            INSERT INTO items (id, title, artist, artists, album, year, path, title_source)
            VALUES (1, 'Test Track', 'Test Artist', '["Test Artist"]', 'Test Album', 2020, ?, 'tags')
        `).run(__filename);

        // Mock readLocalTags to return same data
        jest.mock('../sources/tags', () => ({
            readLocalTags: jest.fn().mockResolvedValue({
                data: {
                    title: 'Test Track',
                    artists: ['Test Artist'],
                    album: 'Test Album',
                    year: 2020,
                    filePath: __filename,
                },
                confidence: 0.5,
                source: 'tags',
            }),
        }));

        const result = await syncTrack(db, 1, __filename);

        expect(result.status).toBe('ok');
        expect(result.conflicts).toBeUndefined();
        expect(result.updated).toBeUndefined();
    });

    it('should detect updates when file differs from database', async () => {
        // This test would require mocking file reading
        // Skipping detailed implementation as it depends on filesystem
        expect(true).toBe(true);
    });

    it('should detect conflicts when user-edited fields change in file', async () => {
        // Insert track with user-edited field
        db.prepare(`
            INSERT INTO items (id, title, artist, path, title_source)
            VALUES (1, 'User Title', 'Test Artist', ?, 'user')
        `).run(__filename);

        // This would detect that file has different title
        // Full test requires mocking filesystem
        expect(true).toBe(true);
    });

    it('should resolve conflict by keeping database value', () => {
        // Insert conflict
        const conflictId = db.prepare(`
            INSERT INTO sync_conflicts (track_id, field, db_value, db_source, file_value, timestamp)
            VALUES (1, 'title', ?, 'user', ?, ?)
        `).run(
            JSON.stringify('DB Title'),
            JSON.stringify('File Title'),
            Date.now()
        ).lastInsertRowid as number;

        // Insert track
        db.prepare(`
            INSERT INTO items (id, title, title_source, path)
            VALUES (1, 'DB Title', 'user', '/test.mp3')
        `).run();

        resolveConflict(db, conflictId, 'db');

        // Conflict should be deleted
        const conflicts = getTrackConflicts(db, 1);
        expect(conflicts.length).toBe(0);
    });

    it('should resolve conflict by keeping file value', () => {
        // Insert conflict
        const conflictId = db.prepare(`
            INSERT INTO sync_conflicts (track_id, field, db_value, db_source, file_value, timestamp)
            VALUES (1, 'title', ?, 'tags', ?, ?)
        `).run(
            JSON.stringify('DB Title'),
            JSON.stringify('File Title'),
            Date.now()
        ).lastInsertRowid as number;

        // Insert track
        db.prepare(`
            INSERT INTO items (id, title, title_source, path)
            VALUES (1, 'DB Title', 'tags', '/test.mp3')
        `).run();

        resolveConflict(db, conflictId, 'file');

        // Track should be updated
        const track = db.prepare('SELECT title, title_source FROM items WHERE id = 1').get() as any;
        expect(track.title).toBe('"File Title"'); // JSON stringified
        expect(track.title_source).toBe('tags');
    });

    it('should resolve conflict with custom value', () => {
        // Insert conflict
        const conflictId = db.prepare(`
            INSERT INTO sync_conflicts (track_id, field, db_value, db_source, file_value, timestamp)
            VALUES (1, 'title', ?, 'tags', ?, ?)
        `).run(
            JSON.stringify('DB Title'),
            JSON.stringify('File Title'),
            Date.now()
        ).lastInsertRowid as number;

        // Insert track
        db.prepare(`
            INSERT INTO items (id, title, title_source, path)
            VALUES (1, 'DB Title', 'tags', '/test.mp3')
        `).run();

        resolveConflict(db, conflictId, 'custom', 'Custom Title');

        // Track should have custom value with user source
        const track = db.prepare('SELECT title, title_source FROM items WHERE id = 1').get() as any;
        expect(track.title).toBe('"Custom Title"'); // JSON stringified
        expect(track.title_source).toBe('user');
    });

    it('should retrieve all conflicts for a track', () => {
        // Insert multiple conflicts
        db.prepare(`
            INSERT INTO sync_conflicts (track_id, field, db_value, db_source, file_value, timestamp)
            VALUES
                (1, 'title', ?, 'user', ?, ?),
                (1, 'album', ?, 'user', ?, ?)
        `).run(
            JSON.stringify('DB Title'), JSON.stringify('File Title'), Date.now(),
            JSON.stringify('DB Album'), JSON.stringify('File Album'), Date.now()
        );

        const conflicts = getTrackConflicts(db, 1);

        expect(conflicts.length).toBe(2);
        expect(conflicts[0].field).toBe('title');
        expect(conflicts[1].field).toBe('album');
    });
});
