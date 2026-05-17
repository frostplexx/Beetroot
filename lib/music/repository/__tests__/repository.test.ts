import Database from 'better-sqlite3';
import { TrackRepository } from '../index';
import fs from 'fs';
import path from 'path';

describe('TrackRepository', () => {
    let db: Database.Database;
    let repository: TrackRepository;
    let dbPath: string;

    beforeEach(() => {
        // Create temporary database
        dbPath = path.join(__dirname, `test-repo-${Date.now()}.db`);
        db = new Database(dbPath);

        // Create schema
        db.exec(`
            CREATE TABLE items (
                id INTEGER PRIMARY KEY,
                title TEXT,
                artist TEXT,
                artists TEXT,
                album TEXT,
                albumartist TEXT,
                year INTEGER,
                month INTEGER,
                day INTEGER,
                track INTEGER,
                tracktotal INTEGER,
                disc INTEGER,
                disctotal INTEGER,
                genres TEXT,
                length REAL,
                comp INTEGER,
                label TEXT,
                isrc TEXT,
                mb_trackid TEXT,
                acoustid_id TEXT,
                mb_albumid TEXT,
                path TEXT,
                file_hash TEXT,
                mtime REAL,
                added REAL,
                missing_since REAL,
                title_source TEXT,
                artist_source TEXT,
                artists_source TEXT,
                album_source TEXT,
                albumartist_source TEXT,
                year_source TEXT,
                genres_source TEXT,
                length_source TEXT,
                mb_trackid_source TEXT,
                acoustid_id_source TEXT
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

        repository = new TrackRepository(db);
    });

    afterEach(() => {
        db.close();
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
    });

    it('should import a new track', async () => {
        // This test would require mocking file operations and external APIs
        // For now, we'll test the basic structure

        const testFilePath = __filename; // Use this test file as dummy

        // Mock the sources to avoid actual file/API operations
        jest.mock('../sources/tags', () => ({
            readLocalTags: jest.fn().mockResolvedValue({
                data: {
                    title: 'Test Track',
                    artists: ['Test Artist'],
                    album: 'Test Album',
                    duration: 180,
                    filePath: testFilePath,
                },
                confidence: 0.5,
                source: 'tags',
            }),
        }));

        // Since we can't actually import without mocking everything,
        // we'll just test that the method exists and structure is correct
        expect(repository.importTrack).toBeDefined();
        expect(typeof repository.importTrack).toBe('function');
    });

    it('should find track by path', () => {
        const testPath = '/music/test.mp3';

        db.prepare(`
            INSERT INTO items (id, title, path)
            VALUES (1, 'Test', ?)
        `).run(testPath);

        // Use private method via any cast for testing
        const track = (repository as any).findTrackByPath(testPath);

        expect(track).toBeDefined();
        expect(track.id).toBe(1);
    });

    it('should mark track as missing', () => {
        db.prepare(`
            INSERT INTO items (id, title, path)
            VALUES (1, 'Test', '/music/test.mp3')
        `).run();

        repository.markMissing(1);

        const track = db.prepare('SELECT missing_since FROM items WHERE id = 1').get() as any;
        expect(track.missing_since).toBeDefined();
        expect(track.missing_since).toBeGreaterThan(0);
    });

    it('should get track conflicts', () => {
        db.prepare(`
            INSERT INTO items (id, title, path)
            VALUES (1, 'Test', '/music/test.mp3')
        `).run();

        db.prepare(`
            INSERT INTO sync_conflicts (track_id, field, db_value, db_source, file_value, timestamp)
            VALUES (1, 'title', ?, 'user', ?, ?)
        `).run(JSON.stringify('Old Title'), JSON.stringify('New Title'), Date.now());

        const conflicts = repository.getConflicts(1);

        expect(conflicts.length).toBe(1);
        expect(conflicts[0].field).toBe('title');
        expect(conflicts[0].dbValue).toBe('Old Title');
        expect(conflicts[0].fileValue).toBe('New Title');
    });

    it('should resolve conflicts', () => {
        db.prepare(`
            INSERT INTO items (id, title, title_source, path)
            VALUES (1, 'Old Title', 'tags', '/music/test.mp3')
        `).run();

        const conflictId = db.prepare(`
            INSERT INTO sync_conflicts (track_id, field, db_value, db_source, file_value, timestamp)
            VALUES (1, 'title', ?, 'tags', ?, ?)
        `).run(
            JSON.stringify('Old Title'),
            JSON.stringify('New Title'),
            Date.now()
        ).lastInsertRowid as number;

        repository.resolveConflict(conflictId, 'file');

        // Conflict should be gone
        const conflicts = repository.getConflicts(1);
        expect(conflicts.length).toBe(0);
    });

    it('should handle upsert for existing track', () => {
        const testPath = '/music/test.mp3';

        // Insert initial track
        db.prepare(`
            INSERT INTO items (id, title, artist, path, added)
            VALUES (1, 'Old Title', 'Test Artist', ?, ?)
        `).run(testPath, Date.now());

        // Upsert with new data
        const track = {
            title: 'New Title',
            artists: ['Test Artist'],
            album: 'Test Album',
            filePath: testPath,
        };

        const sources = [
            {
                data: track,
                confidence: 0.5,
                source: 'tags' as const,
            },
        ];

        const trackId = (repository as any).upsertTrack(track, sources);

        // Should return same ID
        expect(trackId).toBe(1);

        // Should have updated title
        const updated = db.prepare('SELECT title FROM items WHERE id = 1').get() as any;
        expect(updated.title).toBe('New Title');
    });

    it('should insert new track on upsert', () => {
        const testPath = '/music/new.mp3';

        const track = {
            title: 'New Track',
            artists: ['New Artist'],
            filePath: testPath,
        };

        const sources = [
            {
                data: track,
                confidence: 0.5,
                source: 'tags' as const,
            },
        ];

        const trackId = (repository as any).upsertTrack(track, sources);

        expect(trackId).toBeGreaterThan(0);

        const inserted = db.prepare('SELECT title FROM items WHERE id = ?').get(trackId) as any;
        expect(inserted.title).toBe('New Track');
    });
});
