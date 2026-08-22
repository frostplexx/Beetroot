import { beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// globalConfig and the sqlite handle are both resolved at module load, so the
// environment has to be in place before anything under lib/ is imported.
// CONFIG_PATH points at a file that does not exist on purpose: the config then
// comes from DEFAULT_CONFIG plus these two overrides, which keeps the test
// independent of whatever config.yaml the developer has locally.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "beetroot-test-"));
process.env.CONFIG_PATH = path.join(root, "absent.yaml");
process.env.DATABASE_PATH = path.join(root, "library.sqlite3");
process.env.MUSIC_DIRECTORY = path.join(root, "music");

const { default: Repository } = await import("./index");
const { default: db } = await import("../database/db");
const { globalConfig } = await import("../../config");
const { getItemById, getAlbumById } = await import("../database");

const MUSIC = globalConfig.music_directory.replace(/\/+$/, "");

function write(filePath: string, contents = "audio"): string {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
    return filePath;
}

function lib(...parts: string[]): string {
    return path.join(MUSIC, ...parts);
}

function makeAlbum(fields: { album: string; albumartist: string; artpath?: string }): number {
    const info = db
        .prepare("INSERT INTO albums (album, albumartist, artpath, added) VALUES (?, ?, ?, ?)")
        .run(fields.album, fields.albumartist, fields.artpath ?? null, Date.now());
    return Number(info.lastInsertRowid);
}

function makeItem(
    albumId: number,
    fields: { path: string; title: string; album: string; albumartist: string; track: number },
): number {
    const info = db
        .prepare(
            `INSERT INTO items (album_id, path, title, artist, album, albumartist, track, added)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
            albumId,
            fields.path,
            fields.title,
            fields.albumartist,
            fields.album,
            fields.albumartist,
            fields.track,
            Date.now(),
        );
    return Number(info.lastInsertRowid);
}


beforeEach(() => {
    db.run("DELETE FROM items");
    db.run("DELETE FROM albums");
    fs.rmSync(MUSIC, { recursive: true, force: true });
    fs.mkdirSync(MUSIC, { recursive: true });
});

describe("markItemForDeletion", () => {
    test("moves the file into trash and points the row at it", () => {
        const albumId = makeAlbum({ album: "Cocktail", albumartist: "DJ Ali" });
        const from = write(lib("A-F", "DJ Ali", "Cocktail", "01 Cocktail.mp3"));
        const itemId = makeItem(albumId, {
            path: from,
            title: "Cocktail",
            album: "Cocktail",
            albumartist: "DJ Ali",
            track: 1,
        });

        Repository.markItemForDeletion(getItemById(itemId)!);

        const after = getItemById(itemId)!;
        expect(fs.existsSync(from)).toBe(false);
        expect(after.path).toBe(lib(".trash", "A-F", "DJ Ali", "Cocktail", "01 Cocktail.mp3"));
        expect(fs.existsSync(after.path)).toBe(true);
        expect(after.marked_for_deletion).not.toBeNull();
    });
});

describe("restoreItem", () => {
    test("moves the file back to its canonical path and clears the marker", () => {
        const albumId = makeAlbum({ album: "Cocktail", albumartist: "DJ Ali" });
        const from = write(lib("A-F", "DJ Ali", "Cocktail", "01 Cocktail.mp3"));
        const itemId = makeItem(albumId, {
            path: from,
            title: "Cocktail",
            album: "Cocktail",
            albumartist: "DJ Ali",
            track: 1,
        });
        Repository.markItemForDeletion(getItemById(itemId)!);

        const result = Repository.restoreItem(itemId);

        expect(result.to).toBe(from);
        expect(fs.existsSync(from)).toBe(true);
        const after = getItemById(itemId)!;
        expect(after.path).toBe(from);
        expect(after.marked_for_deletion).toBeNull();
    });
});

describe("markAlbumForDeletion", () => {
    test("moves every track and the cover art into trash", () => {
        const albumId = makeAlbum({ album: "Cocktail", albumartist: "DJ Ali" });
        const art = write(lib("A-F", "DJ Ali", "Cocktail", "cover.jpg"), "jpeg");
        db.prepare("UPDATE albums SET artpath = ? WHERE id = ?").run(art, albumId);
        const one = write(lib("A-F", "DJ Ali", "Cocktail", "01 Cocktail.mp3"));
        const two = write(lib("A-F", "DJ Ali", "Cocktail", "02 Sundown.mp3"));
        makeItem(albumId, { path: one, title: "Cocktail", album: "Cocktail", albumartist: "DJ Ali", track: 1 });
        makeItem(albumId, { path: two, title: "Sundown", album: "Cocktail", albumartist: "DJ Ali", track: 2 });

        const result = Repository.markAlbumForDeletion(albumId);

        expect(result.itemsMoved).toBe(2);
        expect(result.artpathMoved).toBe(true);
        expect(fs.existsSync(one)).toBe(false);
        expect(fs.existsSync(two)).toBe(false);
        expect(fs.existsSync(art)).toBe(false);
        expect(getAlbumById(albumId)!.artpath).toBe(
            lib(".trash", "A-F", "DJ Ali", "Cocktail", "cover.jpg"),
        );
    });

    test("puts already-moved files back when a later move fails", () => {
        const albumId = makeAlbum({ album: "Cocktail", albumartist: "DJ Ali" });
        const one = write(lib("A-F", "DJ Ali", "Cocktail", "01 Cocktail.mp3"));
        const two = lib("A-F", "DJ Ali", "Cocktail", "02 Sundown.mp3");
        makeItem(albumId, { path: one, title: "Cocktail", album: "Cocktail", albumartist: "DJ Ali", track: 1 });
        // Row exists, file does not: the second move fails and has to unwind the first.
        makeItem(albumId, { path: two, title: "Sundown", album: "Cocktail", albumartist: "DJ Ali", track: 2 });

        expect(() => Repository.markAlbumForDeletion(albumId)).toThrow();

        expect(fs.existsSync(one)).toBe(true);
        expect(getAlbumById(albumId)!.marked_for_deletion).toBeNull();
    });
});

describe("restoreAlbum", () => {
    test("moves every track back out of trash and unmarks the album", () => {
        const albumId = makeAlbum({ album: "Cocktail", albumartist: "DJ Ali" });
        const art = write(lib("A-F", "DJ Ali", "Cocktail", "cover.jpg"), "jpeg");
        db.prepare("UPDATE albums SET artpath = ? WHERE id = ?").run(art, albumId);
        const one = write(lib("A-F", "DJ Ali", "Cocktail", "01 Cocktail.mp3"));
        const two = write(lib("A-F", "DJ Ali", "Cocktail", "02 Sundown.mp3"));
        makeItem(albumId, { path: one, title: "Cocktail", album: "Cocktail", albumartist: "DJ Ali", track: 1 });
        makeItem(albumId, { path: two, title: "Sundown", album: "Cocktail", albumartist: "DJ Ali", track: 2 });
        Repository.markAlbumForDeletion(albumId);

        const result = Repository.restoreAlbum(albumId);

        expect(result.itemsRestored).toBe(2);
        expect(result.artpathRestored).toBe(true);
        expect(fs.existsSync(one)).toBe(true);
        expect(fs.existsSync(two)).toBe(true);
        expect(fs.existsSync(art)).toBe(true);
        expect(getAlbumById(albumId)!.marked_for_deletion).toBeNull();
        expect(getAlbumById(albumId)!.artpath).toBe(art);
    });
});
