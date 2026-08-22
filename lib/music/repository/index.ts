import { LastfmGenreSource } from "./sources/lastfm_genre/lastfm_genre";
import { LocalTagsSource } from "./sources/tags";
import { MusicBrainzSource, lookupReleaseForCluster, applyClusterReleaseToItem } from "./sources/musicbrainz/musicbrainz";
import { DiscogsSource } from "./sources/discogs/discogs";
import { WikipediaSource } from "./sources/wikipedia/wikipedia";
import { LrclibSource } from "./sources/lrclib/lrclib";
import { ReplayGain } from "./sources/replaygain";
import { DataSource, ReconcileItemError, ReconcilePhase, ReconcileProgress, ReconcileResult, SourceResult } from "./types";
import { Item, Album, writeOrUpdateAlbum, writeOrUpdateItem, updateItem, getItemsByAlbum, getAllItemsByAlbum, deleteItemFromDB, unsafeForceDeleteItemFromDB, getAllItemPaths, batchUpdateItems, getItemsReadyForDeletion, batchDeleteItems, getAlbumsWithMissingArtwork, getAlbumById, checkAndUpdateAlbumMissingStatus, getItemById, setAlbumMarkedForDeletion, updateAlbumArtpath } from "../database";
import { mergeData } from "./merger";
import { normalizeAlbumString } from "../database/normalize";
import { writeBackItem, moveFile, moveFileWithReason, copyFile, computeTargetPath } from "./writeback";
import { globalConfig } from "../../config";
import fsPromises from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import { enumerateMusicFilesStream } from "../utils/enumerate";
import { computeFileHashIfEnabled } from "../utils/hash";
import { handleCoverArt } from "./coverart";
import { checkForDuplicate } from "./duplicate-check";
import { clusterTracks, Cluster } from "./cluster";
import db from "../database/db";


/**
 * Custom error class for adoption failures with phase tracking
 */
class AdoptionError extends Error {
    constructor(
        message: string,
        public readonly phase: 'tags' | 'hash' | 'db' | 'move' | 'rollback' | 'cover',
        public readonly retryable: boolean,
        public readonly itemPath: string
    ) {
        super(message);
        this.name = 'AdoptionError';
    }
}


/**
 * Resolve the canonical trash root, with a trailing slash. Soft-deleted
 * files always live under this prefix; deleteItem() asserts the invariant
 * before unlinking anything.
 */
function trashRoot(): string {
    // Trim a trailing slash from music_directory before joining .trash, otherwise
    // a configured `music_directory: /music/` produces `/music//.trash/`, which
    // POSIX tolerates but breaks string comparisons (path prefix checks,
    // startsWith against trashRoot, etc.).
    const musicDir = globalConfig.music_directory.replace(/\/+$/, '');
    const raw = globalConfig.trash_directory
        ? globalConfig.trash_directory
        : `${musicDir}/.trash`;
    return raw.endsWith('/') ? raw : raw + '/';
}

/**
 * Map a file path inside music_directory to its mirrored location inside the
 * trash root. Throws if the source path isn't actually inside music_directory
 * (would otherwise be a silent no-op via String.replace and trash a file in
 * place — exactly the kind of bad state we want unrepresentable).
 */
function computeTrashPath(itemPath: string): string {
    const musicDir = globalConfig.music_directory.endsWith('/')
        ? globalConfig.music_directory
        : globalConfig.music_directory + '/';
    if (!itemPath.startsWith(musicDir)) {
        throw new Error(`Cannot compute trash path: ${itemPath} is outside music_directory ${musicDir}`);
    }
    const relative = itemPath.slice(musicDir.length);
    return trashRoot() + relative;
}

/**
 * If the desired trash path is already occupied — most likely an orphan from a
 * prior failed delete cycle, or a re-add / re-delete loop — append a numeric
 * suffix so the new file lands in trash without clobbering the old one.
 * Returns the original path when it's free.
 *
 * Retention reaping doesn't care about suffixed names; restore reads
 * `item.path` from the DB, so the suffixed path round-trips fine.
 */
function uniqueTrashPath(desired: string): string {
    if (!fs.existsSync(desired)) return desired;

    const dir = path.dirname(desired);
    const ext = path.extname(desired);
    const base = path.basename(desired, ext);

    for (let i = 2; i < 1000; i++) {
        const candidate = path.join(dir, `${base} (${i})${ext}`);
        if (!fs.existsSync(candidate)) return candidate;
    }
    throw new Error(`Cannot find unique trash path for ${desired} after 1000 attempts`);
}

type ItemMove = { item: Item; from: string; to: string };

/**
 * Relocate a batch of files and commit the result in a single DB transaction.
 * Either every file sits at its new path with the database agreeing, or nothing
 * observably changed: a failed move unwinds the moves before it, and a failed
 * DB write unwinds all of them.
 *
 * `extraMoves` carries files that travel with the batch but have no item row of
 * their own, i.e. album cover art. `commit` runs inside the transaction and
 * owns every column beyond `items.path` — the deletion markers, the album row.
 * Item objects are only mutated once the transaction has committed, so a caller
 * holding one never sees a path that didn't make it to disk.
 */
function applyMoves(
    label: string,
    itemMoves: ItemMove[],
    extraMoves: Array<{ from: string; to: string }>,
    commit: () => void,
): void {
    const done: Array<{ from: string; to: string }> = [];

    const rollback = (stage: string) => {
        for (const m of [...done].reverse()) {
            const r = moveFileWithReason(m.to, m.from);
            if (!r.ok) {
                console.error(
                    `CRITICAL: ${label} ${stage} failed to roll back ${m.to} → ${m.from}: ${r.reason}; manual recovery needed`,
                );
            }
        }
    };

    try {
        for (const m of [...itemMoves, ...extraMoves]) {
            const r = moveFileWithReason(m.from, m.to);
            if (!r.ok) throw new Error(`${label} failed, ${m.from} → ${m.to}: ${r.reason}`);
            done.push({ from: m.from, to: m.to });
        }
    } catch (error) {
        rollback('move');
        throw error;
    }

    try {
        db.transaction(() => {
            for (const m of itemMoves) {
                // Direct UPDATE by id. writeOrUpdateItem routes through
                // findExistingItem, which matches by mb_trackid and finds this
                // very row; under the default duplicate_action 'skip' that
                // silently no-ops the write, leaving the file moved and the row
                // pointing at the old path.
                updateItem(m.item.id, { path: m.to });
            }
            commit();
        })();
    } catch (dbError) {
        rollback('db-failure');
        const msg = dbError instanceof Error ? dbError.message : String(dbError);
        throw new Error(`${label} rolled back, DB write failed: ${msg}`);
    }

    for (const m of itemMoves) m.item.path = m.to;
}



class Repository {
    private readonly dataSources: DataSource[] = [
        new LocalTagsSource(),      // confidence: 0.6
        new MusicBrainzSource(),    // confidence: 0.85 (adjusted by AcoustID score)
        new LrclibSource(),         // confidence: 0.8
        new DiscogsSource(),        // confidence: 0.75
        new LastfmGenreSource(),    // confidence: 0.7
        new WikipediaSource(),      // confidence: 0.65
        new ReplayGain(),           // confidence: 0.9 (calculated from audio)
    ];

    constructor() {
    }

    // == Public functions

    getDataSources(): DataSource[] {
        return [...this.dataSources];
    }

    // Overload signatures
    async resolveItem(path: string): Promise<Item>;
    async resolveItem(item: Item): Promise<Item>;

    // Implementation
    async resolveItem(pathOrItem: string | Item): Promise<Item> {
        if (typeof pathOrItem === 'string') {
            const tmpItem: Item = {
                id: 0,
                path: pathOrItem,
                title: '',
                artist: '',
                album: '',
                source: 'test',
                missing_since: null,
                added: Date.now(),
                track: null,
                year: null,
            } as Item;
            const result = await this._resolveItem(tmpItem);
            // D5: Store sources as a transient property on the item
            (result.item as any)._sources = result.sources;
            return result.item;
        } else {
            const result = await this._resolveItem(pathOrItem);
            // D5: Store sources as a transient property on the item
            (result.item as any)._sources = result.sources;
            return result.item;
        }
    }


    /**
     * Atomically adopt an item into the library with proper rollback on failure.
     *
     * Strategy: Stage-then-commit
     * 1. Write tags (atomic via temp+rename)
     * 2. Compute target path (pure function)
     * 3. Compute hash at current location
     * 4. Write to DB with TARGET path (transaction)
     * 5. Move file to target path
     * 6. On move failure: rollback DB
     * 7. Handle cover art (best effort)
     */
    async adoptItem(item: Item): Promise<{ action: 'inserted' | 'updated' | 'skipped' }> {
        let dbCommitted = false;
        let itemId: number | undefined;
        let albumId: number | undefined;
        const originalPath = item.path;
        const adoptTimings: Record<string, number> = {};

        // D5: Extract source provenance if present (transient property from resolveItem)
        const sources = (item as any)._sources as Partial<Record<keyof Item, string>> | undefined;

        try {
            // Phase 1: Write tags (atomic via temp+rename)
            let t = Date.now();
            await writeBackItem(item, globalConfig.writeback_mode ?? 'missing-only');
            adoptTimings.writeback = Date.now() - t;

            // Phase 2: Compute target path (pure function, cannot fail)
            const targetPath = computeTargetPath(item);

            // Phase 3: Compute hash at original location (read-only)
            t = Date.now();
            if (globalConfig.compute_file_hash) {
                item.file_hash = await computeFileHashIfEnabled(originalPath, true) || null;
            }
            adoptTimings.hash = Date.now() - t;

            // D5: Map source provenance to *_source columns before DB write
            if (sources) {
                const sourceMap: Record<string, string> = {
                    'title': 'title_source',
                    'artist': 'artist_source',
                    'artists': 'artists_source',
                    'album': 'album_source',
                    'albumartist': 'albumartist_source',
                    'year': 'year_source',
                    'month': 'month_source',
                    'day': 'day_source',
                    'genres': 'genres_source',
                    'length': 'length_source',
                    'mb_trackid': 'mb_trackid_source',
                    'acoustid_id': 'acoustid_id_source'
                };

                for (const [field, sourceName] of Object.entries(sources)) {
                    const sourceColumn = sourceMap[field];
                    if (sourceColumn && sourceName) {
                        (item as any)[sourceColumn] = sourceName;
                    }
                }
            }

            // Phase 4: Atomic DB transaction with TARGET path
            t = Date.now();
            const album = this.itemToAlbum(item);
            const result = db.transaction(() => {
                const aId = writeOrUpdateAlbum(album);
                item.album_id = aId;
                item.path = targetPath; // CRITICAL: Write target path, not current
                const writeResult = writeOrUpdateItem(item);
                return { albumId: aId, itemId: writeResult.id, action: writeResult.action };
            })();
            adoptTimings.db = Date.now() - t;

            dbCommitted = true;
            itemId = result.itemId;
            albumId = result.albumId;

            // Duplicate detection skipped the DB write — don't move the file
            // either, otherwise we'd plant a second physical copy on disk
            // pointing at the same album/track row.
            if (result.action === 'skipped') {
                console.log(`Skipped duplicate file: ${originalPath} (existing item id ${result.itemId})`);
                return { action: 'skipped' };
            }

            // Phase 5: Move or copy file (only if target differs from original).
            // Files already inside music_directory are always renamed (reorganise in-place).
            // Files from a watch_directory follow the watch_import_mode setting: 'move'
            // removes the source, 'copy' leaves the original intact.
            t = Date.now();
            if (originalPath !== targetPath) {
                const fromWatchDir = (globalConfig.watch_directories ?? [])
                    .some(d => originalPath.startsWith(d));
                const useMove = !fromWatchDir || (globalConfig.watch_import_mode ?? 'move') === 'move';
                const succeeded = useMove
                    ? moveFile(originalPath, targetPath)
                    : copyFile(originalPath, targetPath);
                if (!succeeded) {
                    throw new AdoptionError(
                        `File ${useMove ? 'move' : 'copy'} failed: ${originalPath} → ${targetPath}`,
                        'move',
                        true,
                        originalPath
                    );
                }
            }
            adoptTimings.move = Date.now() - t;

            // Update in-memory path to match DB
            item.path = targetPath;

            // Phase 6: Cover art (best effort, non-blocking)
            t = Date.now();
            if (albumId) {
                const albumRecord = getAlbumById(albumId);
                if (albumRecord && !albumRecord.artpath) {
                    await handleCoverArt(albumRecord).catch(err => {
                        console.warn(`Cover art failed for album ${albumId}:`, err);
                    });
                }
            }
            adoptTimings.cover = Date.now() - t;

            (item as any)._adoptTimings = adoptTimings;

            return { action: result.action };

        } catch (error) {
            // Rollback DB if file move failed after DB commit
            if (dbCommitted && itemId) {
                console.error(`Adoption failed after DB commit, rolling back item ${itemId}`);
                try {
                    db.transaction(() => {
                        // Item was inserted seconds ago and never surfaced to the user;
                        // no soft-delete state to satisfy the normal guard. Force is
                        // safe here because the row's only existence was this in-flight
                        // adoption that we're aborting.
                        unsafeForceDeleteItemFromDB(itemId!, `adopt rollback for ${originalPath}`);
                    })();
                    console.log(`Rollback successful: removed item ${itemId} from database`);
                } catch (rollbackError) {
                    console.error('CRITICAL: DB rollback failed', {
                        itemId,
                        originalPath,
                        rollbackError
                    });
                    // TODO: Log to monitoring system for manual intervention
                }
            }

            // Re-throw as AdoptionError for better error tracking
            throw error instanceof AdoptionError
                ? error
                : new AdoptionError(
                      error instanceof Error ? error.message : String(error),
                      'rollback',
                      false,
                      originalPath
                  );
        }
    }

    markItemForDeletion(item: Item): void {
        // Invariant maintained after a successful return:
        //   marked_for_deletion IS NOT NULL ⟺ item.path is inside trashRoot()
        // The reconcile cleanup at deleteItem() relies on that biconditional to
        // decide what's safe to permanently unlink, so the path and the marker
        // have to land in the same transaction.
        const now = Date.now();
        const trashPath = uniqueTrashPath(computeTrashPath(item.path));

        applyMoves('Trashing', [{ item, from: item.path, to: trashPath }], [], () => {
            updateItem(item.id, { marked_for_deletion: now });
        });

        item.marked_for_deletion = now;
    }

    // Restore a single soft-deleted item to its canonical path. Refuses if the
    // item's album is itself soft-deleted — the user should restore the whole
    // album in that case so we don't end up with a partially-revived album.
    //
    // Atomic: move ok + DB ok, or no observable change.
    restoreItem(itemId: number): { restored: boolean; from: string; to: string } {
        const item = getItemById(itemId);
        if (!item) throw new Error(`Item ${itemId} not found`);
        if (item.marked_for_deletion == null) {
            throw new Error(`Item ${itemId} is not soft-deleted`);
        }
        if (item.album_id != null) {
            const album = getAlbumById(item.album_id);
            if (album?.marked_for_deletion != null) {
                throw new Error(
                    `Album ${item.album_id} is soft-deleted; restore the whole album instead`,
                );
            }
        }
        const fromPath = item.path;
        const toPath = computeTargetPath(item);

        applyMoves('Restore', [{ item, from: fromPath, to: toPath }], [], () => {
            updateItem(item.id, { marked_for_deletion: undefined });
        });

        item.marked_for_deletion = undefined;
        if (item.album_id != null) checkAndUpdateAlbumMissingStatus(item.album_id);
        return { restored: true, from: fromPath, to: toPath };
    }

    markMissing(item: Item): void {
        item.missing_since = Date.now();
        writeOrUpdateItem(item);

        // Check if all items in the album are missing and mark album accordingly
        if (item.album_id) {
            checkAndUpdateAlbumMissingStatus(item.album_id);
        }
    }


    unmarkMissing(item: Item): void {
        item.missing_since = null;
        writeOrUpdateItem(item);

        // Check if album should be unmarked as missing
        if (item.album_id) {
            checkAndUpdateAlbumMissingStatus(item.album_id);
        }
    }

    /**
     * Soft-delete an album: move every track file into trash, mark each
     * item row with `marked_for_deletion`, and mark the album row too so it
     * disappears from listings. All-or-nothing on the filesystem side: if any
     * file move fails, the already-moved files are rolled back to their
     * original locations and the DB is untouched. The caller sees the
     * original error so they can surface it; the library is in the same state
     * as before the call.
     *
     * Returned counts let the API report exactly what happened to the user.
     */
    markAlbumForDeletion(albumId: number): { itemsMoved: number; albumMarked: boolean; artpathMoved: boolean } {
        const album = getAlbumById(albumId);
        if (!album) throw new Error(`Album ${albumId} not found`);
        const items = getItemsByAlbum(albumId);
        const now = Date.now();

        const itemMoves: ItemMove[] = items.map(item => ({
            item,
            from: item.path,
            to: uniqueTrashPath(computeTrashPath(item.path)),
        }));

        // Album artpath: only move it if it's inside music_directory and the
        // file actually exists on disk. computeTrashPath throws otherwise,
        // which we treat as "not ours to manage" (e.g. an absolute path
        // pointing at an external cache) and silently skip.
        let artMove: { from: string; to: string } | null = null;
        if (album.artpath && fs.existsSync(album.artpath)) {
            try {
                artMove = { from: album.artpath, to: uniqueTrashPath(computeTrashPath(album.artpath)) };
            } catch {
                artMove = null;
            }
        }

        // Post-condition once this returns:
        //   every item.path under trashRoot()
        //   every item.marked_for_deletion = now
        //   album.marked_for_deletion = now
        //   album.artpath either unchanged or under trashRoot()
        applyMoves('Trashing', itemMoves, artMove ? [artMove] : [], () => {
            for (const m of itemMoves) {
                updateItem(m.item.id, { marked_for_deletion: now });
            }
            if (artMove) updateAlbumArtpath(albumId, artMove.to);
            setAlbumMarkedForDeletion(albumId, now);
        });

        for (const item of items) item.marked_for_deletion = now;

        return { itemsMoved: itemMoves.length, albumMarked: true, artpathMoved: artMove != null };
    }

    /**
     * Restore a soft-deleted album: move every track file back to its
     * canonical location (computed from the path template), clear the
     * marked_for_deletion markers, and unmark the album. Symmetric counterpart
     * to markAlbumForDeletion: all-or-nothing on the filesystem, single DB tx
     * for the metadata updates.
     */
    restoreAlbum(albumId: number): { itemsRestored: number; artpathRestored: boolean } {
        const album = getAlbumById(albumId);
        if (!album) throw new Error(`Album ${albumId} not found`);
        if (album.marked_for_deletion == null) {
            throw new Error(`Album ${albumId} is not soft-deleted`);
        }
        // getItemsByAlbum hides marked items from user-facing lookups; here we
        // explicitly need to see them.
        const items = getAllItemsByAlbum(albumId).filter(i => i.marked_for_deletion != null);

        const itemMoves: ItemMove[] = items.map(item => ({
            item,
            from: item.path,
            to: computeTargetPath(item),
        }));

        // Restore artpath to the directory the tracks land in (all items in a
        // single-disc album share one dir; for multi-disc the cover sits next
        // to the first item). Skip if there's no artpath or it's gone from disk
        // (e.g. retention reaped just the art).
        let artMove: { from: string; to: string } | null = null;
        let staleArt: string | null = null;
        let artpath = album.artpath;
        if (album.artpath && fs.existsSync(album.artpath) && itemMoves.length > 0) {
            const destArt = path.join(path.dirname(itemMoves[0].to), path.basename(album.artpath));
            artpath = destArt;
            if (fs.existsSync(destArt)) {
                // The destination already has a cover, e.g. a re-imported copy
                // of the album wrote one. Keep that file and drop our trash
                // copy, re-pointing album.artpath at the survivor so nothing
                // dangles in either the DB or trash. Deleting only once the
                // batch has committed keeps it out of the rollback path.
                staleArt = album.artpath;
            } else {
                artMove = { from: album.artpath, to: destArt };
            }
        }

        applyMoves('Restore', itemMoves, artMove ? [artMove] : [], () => {
            for (const m of itemMoves) {
                updateItem(m.item.id, { marked_for_deletion: undefined });
            }
            if (artpath !== album.artpath) updateAlbumArtpath(albumId, artpath);
            setAlbumMarkedForDeletion(albumId, null);
        });

        for (const item of items) item.marked_for_deletion = undefined;
        if (staleArt) {
            try { fs.unlinkSync(staleArt); } catch { /* best effort */ }
        }

        return { itemsRestored: itemMoves.length, artpathRestored: artpath !== album.artpath };
    }



    // Runs full reconciliation: detect missing, import new, cleanup trash
    async reconcile(options?: {
        concurrency?: number;
        batchSize?: number;
        progressCallback?: (progress: ReconcileProgress) => void;
        errorCallback?: (error: ReconcileItemError) => void;
    }): Promise<ReconcileResult> {
        const concurrency = options?.concurrency ?? 10;
        const batchSize = options?.batchSize ?? 100;
        const progressCallback = options?.progressCallback;
        const errorCallback = options?.errorCallback;

        const result: ReconcileResult = {
            scannedFiles: 0,
            newFilesFound: 0,
            newFilesImported: 0,
            missingFilesDetected: 0,
            missingArtworkDetected: 0,
            artworkFixed: 0,
            deletedItems: 0,
            errors: [],
        };

        // Centralised progress emit. Always carries the running result plus the
        // current phase; callers add `message`, `currentPath`, `processed`,
        // `total` to flesh out the UI.
        const emit = (phase: ReconcilePhase, extras: Partial<ReconcileProgress> = {}) => {
            if (progressCallback) progressCallback({ ...result, phase, ...extras });
        };
        const emitError = (phase: ReconcilePhase, path: string, err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            if (errorCallback) {
                errorCallback({ phase, path, error: msg, timestamp: Date.now() });
            }
        };

        console.log(`Reconciling: ${globalConfig.music_directory}`);
        emit('starting', { message: 'Starting reconcile' });

        try {
            // Step 1: Load DB paths filtered to music_directory scope (filter pushed to SQL)
            const musicDir = globalConfig.music_directory.replace('~', process.env.HOME || '');
            emit('scanning', { message: 'Loading database paths' });
            const dbPaths = getAllItemPaths(musicDir); // Map<path, { id, album_id }>
            const dbPathSet = new Set(dbPaths.keys());
            console.log(`Database: ${dbPaths.size} tracks in scope`);

            // Step 2: Stream files and detect missing/new in a single pass
            const newFiles: string[] = [];
            const seenPaths = new Set<string>();

            emit('scanning', { message: 'Walking music directory', processed: 0 });
            for await (const filePath of enumerateMusicFilesStream(undefined, globalConfig.watch_directories ?? [])) {
                result.scannedFiles++;
                seenPaths.add(filePath);

                // Check if file is new
                if (!dbPathSet.has(filePath)) {
                    newFiles.push(filePath);
                    result.newFilesFound++;
                }

                // Report progress every 100 files so the UI tick stays lively
                // without spamming SSE on huge libraries.
                if (result.scannedFiles % 100 === 0) {
                    emit('scanning', {
                        message: 'Walking music directory',
                        processed: result.scannedFiles,
                        currentPath: filePath,
                    });
                }
            }

            console.log(`Scanned: ${result.scannedFiles} files (${newFiles.length} new)`);
            emit('scanning', {
                message: `Scanned ${result.scannedFiles} files (${newFiles.length} new)`,
                processed: result.scannedFiles,
            });

            // Step 3: Detect missing files (in DB but not on disk)
            emit('detecting-missing', { message: 'Detecting missing files' });
            const missingUpdates: Array<{ id: number; fields: Partial<Item> }> = [];
            const affectedAlbumIds = new Set<number>();

            for (const [dbPath, { id, album_id }] of dbPaths.entries()) {
                if (!seenPaths.has(dbPath)) {
                    missingUpdates.push({
                        id,
                        fields: { missing_since: Date.now() }
                    });
                    result.missingFilesDetected++;

                    // Collect album_id directly from the path map (no N+1 query)
                    if (album_id) {
                        affectedAlbumIds.add(album_id);
                    }
                }
            }

            // Batch update missing items
            if (missingUpdates.length > 0) {
                console.log(`Missing: ${missingUpdates.length} files marked`);
                emit('detecting-missing', {
                    message: `Marking ${missingUpdates.length} missing files`,
                    total: missingUpdates.length,
                });

                for (let i = 0; i < missingUpdates.length; i += batchSize) {
                    const batch = missingUpdates.slice(i, i + batchSize);
                    batchUpdateItems(batch);
                }

                // Check and update album missing status for all affected albums
                for (const albumId of affectedAlbumIds) {
                    checkAndUpdateAlbumMissingStatus(albumId);
                }
            }

            // Step 4: Import new files with concurrency control
            // Failures here are queued for a retry pass at the end of the
            // import phase. Without that, a transient failure (file briefly
            // locked, network blip during resolveItem) would silently drop the
            // file until the next reconcile cycle.
            const failedSeeded: Item[] = [];
            const failedPaths: string[] = [];

            if (newFiles.length > 0) {
                console.log(`Importing: ${newFiles.length} files...`);

                // Pre-filter: check for duplicates in parallel with bounded concurrency
                const filesToImport: string[] = [];
                let skippedDuplicates = 0;
                let dupChecked = 0;

                emit('duplicate-check', {
                    message: 'Checking for duplicates',
                    total: newFiles.length,
                    processed: 0,
                });

                // Process duplicate checks in batches with same concurrency as import
                for (let i = 0; i < newFiles.length; i += concurrency) {
                    const batch = newFiles.slice(i, i + concurrency);

                    const duplicateChecks = await Promise.all(
                        batch.map(async (filePath) => ({
                            filePath,
                            isDuplicate: await checkForDuplicate(filePath)
                        }))
                    );

                    for (const { filePath, isDuplicate } of duplicateChecks) {
                        if (isDuplicate) {
                            skippedDuplicates++;
                        } else {
                            filesToImport.push(filePath);
                        }
                    }
                    dupChecked += batch.length;
                    emit('duplicate-check', {
                        message: 'Checking for duplicates',
                        total: newFiles.length,
                        processed: dupChecked,
                        currentPath: batch[batch.length - 1],
                    });
                }

                if (skippedDuplicates > 0) {
                    console.log(`Skipped: ${skippedDuplicates} duplicates`);
                }

                // Clustering pass (Picard-style "Cluster -> Lookup"). Pre-read
                // local tags so we can group tracks of one album together before
                // any MB lookup happens; then do ONE MB release search per
                // cluster so every track in the cluster ends up with the same
                // mb_albumid and lands on a single albums row. This is what
                // stops a stray track from being misclassified as a single.
                const tagsSource = new LocalTagsSource();
                const tagged: Item[] = [];
                const tagFailed: string[] = [];
                emit('tag-read', {
                    message: 'Reading local tags',
                    total: filesToImport.length,
                    processed: 0,
                });

                let tagDone = 0;
                for (let i = 0; i < filesToImport.length; i += concurrency) {
                    const batch = filesToImport.slice(i, i + concurrency);
                    const readResults = await Promise.all(batch.map(async (filePath) => {
                        try {
                            const tmp = makeEmptyImportItem(filePath);
                            const item = await tagsSource.getData(tmp);
                            return { filePath, item, ok: true as const };
                        } catch (error) {
                            console.debug(`Tag pre-read failed for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
                            return { filePath, ok: false as const };
                        }
                    }));
                    for (const r of readResults) {
                        if (r.ok) tagged.push(r.item);
                        else tagFailed.push(r.filePath);
                    }
                    tagDone += batch.length;
                    emit('tag-read', {
                        message: 'Reading local tags',
                        total: filesToImport.length,
                        processed: tagDone,
                        currentPath: batch[batch.length - 1],
                    });
                }

                emit('clustering', {
                    message: `Clustering ${tagged.length} files`,
                });
                const rawClusters = clusterTracks(tagged);
                console.log(`Clustering: ${tagged.length} files → ${rawClusters.length} clusters`);

                // Cheap pre-MB skip: if a cluster's seed album already exists in
                // the DB and every cluster track matches an existing item by
                // (disc,track) or normalized title, drop the matched tracks (or
                // the whole cluster) before any MB / source fetching runs. This
                // is the hot path that prevents re-importing albums that are
                // already in the library but happen to sit at new paths (watch
                // dir drop, manual rename, path-template change, etc.).
                let preSkipped = 0;
                const existingMatchStmt = db.prepare(`
                    SELECT i.disc, i.track, i.title
                    FROM items i
                    JOIN albums a ON a.id = i.album_id
                    WHERE a.album_normalized = ?
                      AND (
                          a.albumartist_normalized = ?
                          OR (? = '' AND (a.albumartist_normalized IS NULL OR a.albumartist_normalized = ''))
                      )
                      AND i.marked_for_deletion IS NULL
                `);
                for (const cluster of rawClusters) {
                    if (!cluster.seedAlbum) continue;
                    const normAlbum = normalizeAlbumString(cluster.seedAlbum);
                    if (!normAlbum) continue;
                    const normArtist = normalizeAlbumString(cluster.seedAlbumArtist);
                    const existing = existingMatchStmt.all(normAlbum, normArtist, normArtist) as Array<{
                        disc: number | null;
                        track: number | null;
                        title: string | null;
                    }>;
                    if (existing.length === 0) continue;

                    const slotSet = new Set<string>();
                    const titleSet = new Set<string>();
                    for (const e of existing) {
                        if (e.track != null) slotSet.add(`${e.disc ?? 1}:${e.track}`);
                        if (e.title) {
                            const t = normalizeAlbumString(e.title);
                            if (t) titleSet.add(t);
                        }
                    }

                    const before = cluster.tracks.length;
                    cluster.tracks = cluster.tracks.filter(t => {
                        const slot = t.track != null ? `${t.disc ?? 1}:${t.track}` : null;
                        if (slot && slotSet.has(slot)) return false;
                        const tn = t.title ? normalizeAlbumString(t.title) : '';
                        if (tn && titleSet.has(tn)) return false;
                        return true;
                    });
                    preSkipped += before - cluster.tracks.length;
                }

                const clusters = rawClusters.filter(c => c.tracks.length > 0);
                const droppedClusters = rawClusters.length - clusters.length;
                if (preSkipped > 0 || droppedClusters > 0) {
                    console.log(
                        `Pre-MB skip: ${preSkipped} tracks already in library, ${droppedClusters} clusters fully covered`,
                    );
                    emit('clustering', {
                        message: `Skipped ${preSkipped} already-imported track${preSkipped === 1 ? '' : 's'} (${droppedClusters} cluster${droppedClusters === 1 ? '' : 's'} dropped)`,
                    });
                }

                const totalToImport = clusters.reduce((s, c) => s + c.tracks.length, 0) + tagFailed.length;
                let imported = 0;

                let clusterIdx = 0;
                for (const cluster of clusters) {
                    clusterIdx++;
                    const clusterLabel = cluster.seedAlbum
                        ? `${cluster.seedAlbumArtist ?? '?'}, ${cluster.seedAlbum}`
                        : `(no album signal)`;
                    emit('cluster-import', {
                        message: `Cluster ${clusterIdx} of ${clusters.length}: ${clusterLabel}`,
                        total: totalToImport,
                        processed: imported,
                    });
                    await this.seedClusterFromMusicBrainz(cluster);

                    // Pre-fetch data from all sources in parallel before any per-track
                    // resolution starts. Album-level sources fire one request; Lrclib
                    // fires all track requests simultaneously. getData calls find cache warm.
                    await Promise.all(
                        this.dataSources.map(s =>
                            s.seedCluster(cluster).catch(() => {})
                        )
                    );

                    // After MB seed, filter duplicates before hitting any source APIs.
                    // Catches: (a) intra-cluster tracks with the same mb_trackid,
                    //          (b) tracks whose mb_trackid is already in the DB.
                    const mbIdInDb = db.prepare(
                        'SELECT id FROM items WHERE mb_trackid = ? AND mb_trackid IS NOT NULL'
                    );
                    const seenMbIds = new Set<string>();
                    cluster.tracks = cluster.tracks.filter(track => {
                        if (!track.mb_trackid) return true; // no id to check — let adoptItem decide
                        if (seenMbIds.has(track.mb_trackid)) {
                            console.log(`Skipping intra-cluster duplicate: ${track.path}`);
                            return false;
                        }
                        seenMbIds.add(track.mb_trackid);
                        const existing = mbIdInDb.get(track.mb_trackid) as { id: number } | undefined;
                        if (existing) {
                            console.log(`Skipping known duplicate: ${track.path} (existing id ${existing.id})`);
                            return false;
                        }
                        return true;
                    });

                    for (let i = 0; i < cluster.tracks.length; i += concurrency) {
                        const batch = cluster.tracks.slice(i, i + concurrency);
                        const promises = batch.map(async (seeded) => {
                            try {
                                const t0 = Date.now();
                                const item = await this.resolveItem(seeded);
                                const resolveMs = Date.now() - t0;
                                const t1 = Date.now();
                                const adopt = await this.adoptItem(item);
                                const adoptMs = Date.now() - t1;
                                logImportPerf(item, resolveMs, adoptMs);
                                if (adopt.action === 'inserted') result.newFilesImported++;
                            } catch (error) {
                                console.warn(`Import attempt failed (queued for retry): ${seeded.path} - ${error instanceof Error ? error.message : String(error)}`);
                                failedSeeded.push(seeded);
                                emitError('cluster-import', seeded.path, error);
                            }
                        });
                        await Promise.all(promises);
                        imported += batch.length;
                        emit('cluster-import', {
                            message: `Cluster ${clusterIdx} of ${clusters.length}: ${clusterLabel}`,
                            total: totalToImport,
                            processed: imported,
                            currentPath: batch[batch.length - 1]?.path,
                        });
                    }
                }

                // Files whose tag pre-read failed bypass clustering entirely
                // and fall back to the original per-file path.
                if (tagFailed.length > 0) {
                    emit('tag-failed-import', {
                        message: `Importing ${tagFailed.length} files without tag data`,
                        total: totalToImport,
                        processed: imported,
                    });
                }
                for (let i = 0; i < tagFailed.length; i += concurrency) {
                    const batch = tagFailed.slice(i, i + concurrency);
                    const promises = batch.map(async (filePath) => {
                        try {
                            const t0 = Date.now();
                            const item = await this.resolveItem(filePath);
                            const resolveMs = Date.now() - t0;
                            const t1 = Date.now();
                            const adopt = await this.adoptItem(item);
                            const adoptMs = Date.now() - t1;
                            logImportPerf(item, resolveMs, adoptMs);
                            if (adopt.action === 'inserted') result.newFilesImported++;
                        } catch (error) {
                            console.warn(`Import attempt failed (queued for retry): ${filePath} - ${error instanceof Error ? error.message : String(error)}`);
                            failedPaths.push(filePath);
                            emitError('tag-failed-import', filePath, error);
                        }
                    });
                    await Promise.all(promises);
                    imported += batch.length;
                    emit('tag-failed-import', {
                        message: `Importing files without tag data`,
                        total: totalToImport,
                        processed: imported,
                        currentPath: batch[batch.length - 1],
                    });
                }
            }

            // Step 4b: Retry adoptions that failed on the first pass. A move
            // may have lost a race with the OS (file still being flushed by the
            // writer that triggered the watcher), or resolveItem may have hit a
            // transient network error. Re-running once at the end of the cycle
            // catches these without waiting for the next reconcile interval.
            if (failedSeeded.length > 0 || failedPaths.length > 0) {
                const totalRetry = failedSeeded.length + failedPaths.length;
                console.log(`Retrying: ${totalRetry} failed adoption${totalRetry === 1 ? '' : 's'}`);
                let retryDone = 0;
                emit('retry', {
                    message: `Retrying ${totalRetry} failed adoption${totalRetry === 1 ? '' : 's'}`,
                    total: totalRetry,
                    processed: 0,
                });

                for (let i = 0; i < failedSeeded.length; i += concurrency) {
                    const batch = failedSeeded.slice(i, i + concurrency);
                    const promises = batch.map(async (seeded) => {
                        try {
                            const item = await this.resolveItem(seeded);
                            const adopt = await this.adoptItem(item);
                            if (adopt.action === 'inserted') result.newFilesImported++;
                        } catch (error) {
                            const errorMsg = `Import retry failed: ${seeded.path} - ${error instanceof Error ? error.message : String(error)}`;
                            console.error(errorMsg);
                            result.errors.push(errorMsg);
                            emitError('retry', seeded.path, error);
                        }
                    });
                    await Promise.all(promises);
                    retryDone += batch.length;
                    emit('retry', {
                        message: `Retrying failed adoptions`,
                        total: totalRetry,
                        processed: retryDone,
                        currentPath: batch[batch.length - 1]?.path,
                    });
                }

                for (let i = 0; i < failedPaths.length; i += concurrency) {
                    const batch = failedPaths.slice(i, i + concurrency);
                    const promises = batch.map(async (filePath) => {
                        try {
                            const item = await this.resolveItem(filePath);
                            const adopt = await this.adoptItem(item);
                            if (adopt.action === 'inserted') result.newFilesImported++;
                        } catch (error) {
                            const errorMsg = `Import retry failed: ${filePath} - ${error instanceof Error ? error.message : String(error)}`;
                            console.error(errorMsg);
                            result.errors.push(errorMsg);
                            emitError('retry', filePath, error);
                        }
                    });
                    await Promise.all(promises);
                    retryDone += batch.length;
                    emit('retry', {
                        message: `Retrying failed adoptions`,
                        total: totalRetry,
                        processed: retryDone,
                        currentPath: batch[batch.length - 1],
                    });
                }
            }

            // Step 5: Fix missing artwork (album-level)
            const albumsWithMissingArtwork = getAlbumsWithMissingArtwork();
            result.missingArtworkDetected = albumsWithMissingArtwork.length;

            if (albumsWithMissingArtwork.length > 0) {
                console.log(`Artwork: fetching for ${albumsWithMissingArtwork.length} albums...`);
                emit('fixing-artwork', {
                    message: `Fetching artwork for ${albumsWithMissingArtwork.length} albums`,
                    total: albumsWithMissingArtwork.length,
                    processed: 0,
                });

                let artDone = 0;
                for (let i = 0; i < albumsWithMissingArtwork.length; i += concurrency) {
                    const batch = albumsWithMissingArtwork.slice(i, i + concurrency);

                    const promises = batch.map(async (album) => {
                        try {
                            const success = await handleCoverArt(album);
                            if (success) {
                                result.artworkFixed++;
                            }
                        } catch (error) {
                            const errorMsg = `Artwork failed: ${album.albumartist} - ${album.album}`;
                            console.error(errorMsg);
                            result.errors.push(errorMsg);
                            emitError(
                                'fixing-artwork',
                                `${album.albumartist}, ${album.album}`,
                                error,
                            );
                        }
                    });

                    await Promise.all(promises);
                    artDone += batch.length;
                    const last = batch[batch.length - 1];
                    emit('fixing-artwork', {
                        message: 'Fetching album artwork',
                        total: albumsWithMissingArtwork.length,
                        processed: artDone,
                        currentPath: last
                            ? `${last.albumartist}, ${last.album}`
                            : undefined,
                    });
                }

                if (result.artworkFixed > 0) {
                    console.log(`Artwork: fixed ${result.artworkFixed}/${result.missingArtworkDetected}`);
                }
            }

            // Step 6: Clean up trash (delete items older than delete_after days)
            const itemsToDelete = getItemsReadyForDeletion(globalConfig.delete_after);

            if (itemsToDelete.length > 0) {
                console.log(`Cleanup: deleting ${itemsToDelete.length} items older than ${globalConfig.delete_after} days`);
                emit('cleanup', {
                    message: `Cleaning up ${itemsToDelete.length} expired trash items`,
                    total: itemsToDelete.length,
                    processed: 0,
                });
                let cleanupDone = 0;
                for (const item of itemsToDelete) {
                    try {
                        await this.deleteItem(item);
                        result.deletedItems++;
                    } catch (error) {
                        const errorMsg = `Delete failed: ${item.path} - ${error instanceof Error ? error.message : String(error)}`;
                        console.error(errorMsg);
                        result.errors.push(errorMsg);
                        emitError('cleanup', item.path, error);
                    }
                    cleanupDone++;
                    emit('cleanup', {
                        message: 'Cleaning up expired trash items',
                        total: itemsToDelete.length,
                        processed: cleanupDone,
                        currentPath: item.path,
                    });
                }
            }

            emit('finalizing', { message: 'Finalizing' });
            console.log(`Complete: ${result.newFilesImported} imported, ${result.missingFilesDetected} missing, ${result.artworkFixed} artwork, ${result.deletedItems} deleted`);
            if (result.errors.length > 0) {
                console.error(`Errors: ${result.errors.length} total`);
            }
            return result;

        } catch (error) {
            console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
            result.errors.push(`Fatal error: ${error}`);
            throw error;
        }
    }

    // == Private functions

    private async deleteItem(item: Item): Promise<void> {
        // Permanently reap a soft-deleted item. Caller (reconcile cleanup) is
        // expected to have already filtered to items whose marked_for_deletion
        // is past the delete_after threshold; we re-check the invariants here
        // because this is the one place that actually unlinks user files.
        const trash = trashRoot();
        const eligible =
            item.marked_for_deletion != null &&
            item.path.startsWith(trash) &&
            (Date.now() - item.marked_for_deletion) > globalConfig.delete_after * 24 * 60 * 60 * 1000;

        if (!eligible) {
            // Invariant violation upstream — refuse to delete rather than silently
            // unlinking something that may not be in trash at all.
            console.warn(`deleteItem refused: item ${item.id} fails invariant (marked: ${item.marked_for_deletion}, path: ${item.path})`);
            return;
        }

        const albumId = item.album_id;

        try {
            await fsPromises.unlink(item.path);
            if (item.artpath) {
                await fsPromises.unlink(item.artpath).catch(() => {}); // Ignore if art doesn't exist
            }
        } catch (error) {
            console.error(`Delete failed: ${item.path} - ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }

        deleteItemFromDB(item.id);

        // If this was the last item in a soft-deleted album, reap the album
        // row + its trash artpath too so nothing orphans in either DB or fs.
        if (albumId != null) {
            const remaining = db
                .prepare(`SELECT COUNT(*) AS c FROM items WHERE album_id = ?`)
                .get(albumId) as { c: number };
            if (remaining.c === 0) {
                const album = getAlbumById(albumId);
                if (album && album.marked_for_deletion != null) {
                    if (album.artpath && album.artpath.startsWith(trash)) {
                        await fsPromises.unlink(album.artpath).catch(() => {});
                    }
                    db.prepare(`DELETE FROM albums WHERE id = ?`).run(albumId);
                }
            }
        }
    }


    /**
     * Fetch data from all sources in parallel when possible.
     * Sources run sequentially until we have base metadata (artist + album),
     * then remaining sources run in parallel.
     *
     * IMPORTANT: All sources operate on the ORIGINAL item to avoid circular evidence.
     * The merger combines results based on confidence, not sequential enrichment.
     */
    private async fetchFromAllSources(item: Item): Promise<SourceResult[]> {
        const results: SourceResult[] = [];
        const originalItem = { ...item };

        // Check if we have minimal metadata needed for other sources
        const hasMinimalMetadata = (): boolean => {
            // Check if any source has provided minimal metadata
            return results.some(r => r.data?.artist && r.data?.album);
        };

        let remainingSources = [...this.dataSources];

        // Run sources sequentially until we have base metadata
        while (!hasMinimalMetadata() && remainingSources.length > 0) {
            const source = remainingSources.shift()!;
            const startTime = Date.now();
            const sourceName = source.constructor.name;

            try {
                // Always call on original item, never enriched
                const data = await source.getData({ ...originalItem });
                const duration = Date.now() - startTime;

                results.push({
                    sourceName,
                    confidence: source.confidence,
                    data,
                    duration,
                });
            } catch (error) {
                const duration = Date.now() - startTime;

                results.push({
                    sourceName,
                    confidence: source.confidence,
                    data: null,
                    error: error instanceof Error ? error : new Error(String(error)),
                    duration,
                });
            }
        }

        // Run remaining sources in parallel on the original item
        if (remainingSources.length > 0) {
            const sourcePromises = remainingSources.map(async (source) => {
                const startTime = Date.now();
                const sourceName = source.constructor.name;

                try {
                    // Always call on original item, never enriched
                    const data = await source.getData({ ...originalItem });
                    const duration = Date.now() - startTime;

                    return {
                        sourceName,
                        confidence: source.confidence,
                        data,
                        duration,
                    } as SourceResult;
                } catch (error) {
                    const duration = Date.now() - startTime;

                    return {
                        sourceName,
                        confidence: source.confidence,
                        data: null,
                        error: error instanceof Error ? error : new Error(String(error)),
                        duration,
                    } as SourceResult;
                }
            });

            const parallelResults = await Promise.all(sourcePromises);
            results.push(...parallelResults);
        }

        return results;
    }

    private async _resolveItem(item: Item): Promise<{ item: Item; sources?: Partial<Record<keyof Item, string>> }> {
        const results = await this.fetchFromAllSources(item)
        const merged = mergeData(results)

        if (merged.data == null) {
            throw new Error('Failed to merge data from sources');
        }

        (merged.data as any)._sourceTimings = results.map(r => ({
            name: r.sourceName,
            ms: r.duration ?? 0,
            error: !!r.error,
        }));

        return {
            item: merged.data,
            sources: merged.sources
        };
    }

    // Legacy method - kept for backward compatibility but not currently used
    // adoptItem() now handles DB writes directly with proper transaction management
    private writeItemToDB(item: Item): number {
        // Wrap album write + item write in a transaction (D3)
        // If item write fails, album should not exist orphaned
        const transaction = db.transaction(() => {
            // Extract album data from item and write/update album first
            const album = this.itemToAlbum(item)
            const albumId = writeOrUpdateAlbum(album)

            // Set the album_id on the item and write it
            item.album_id = albumId
            writeOrUpdateItem(item)

            return albumId
        })

        return transaction()
    }


    private itemToAlbum(item: Item): Album {
        return itemToAlbum(item);
    }

    // One MB release lookup per cluster, then seed every cluster track's
    // mb_albumid (+ mb_releasegroupid) so the downstream MusicBrainzSource
    // short-circuits to the same release and writeOrUpdateAlbum's cascade
    // collapses the cluster onto a single albums row. No-op when the
    // cluster has no album signal at all, in which case the per-track MB
    // path runs as today.
    private async seedClusterFromMusicBrainz(cluster: Cluster): Promise<void> {
        if (!cluster.seedAlbum) return;

        // Reuse a release-group hint if any track already has one from tags.
        const rgHint = cluster.tracks.find(t => t.mb_releasegroupid)?.mb_releasegroupid ?? null;

        const hit = await lookupReleaseForCluster({
            albumartist: cluster.seedAlbumArtist,
            album: cluster.seedAlbum,
            trackCount: cluster.tracks.length,
            releaseGroupId: rgHint,
        });

        if (!hit) {
            console.debug(`Cluster lookup miss: "${cluster.seedAlbum}" by "${cluster.seedAlbumArtist ?? '?'}" (${cluster.tracks.length} tracks)`);
            return;
        }

        // Reuse the release we already fetched to enrich every cluster track in
        // one shot. Without this each track would re-fetch the same release in
        // MusicBrainzSource (the in-flight cache only dedupes concurrent calls
        // within a single batch). _mbClusterApplied tells the MB source to skip.
        for (let i = 0; i < cluster.tracks.length; i++) {
            const applied = applyClusterReleaseToItem(cluster.tracks[i], hit.release);
            (applied as any)._mbClusterApplied = true;
            cluster.tracks[i] = applied;
        }
        console.log(`Cluster → release ${hit.mb_albumid}: "${cluster.seedAlbum}" (${cluster.tracks.length} tracks)`);
    }
}

function makeEmptyImportItem(filePath: string): Item {
    return {
        id: 0,
        path: filePath,
        title: '',
        artist: '',
        album: '',
        source: 'test',
        missing_since: null,
        added: Date.now(),
        track: null,
        year: null,
    } as Item;
}

export function itemToAlbum(item: Item): Album {
    return {
        id: 0, // Will be auto-generated or found by lookup
        album: item.album,
        albumartist: item.albumartist || '',
        albumartist_credit: item.albumartist_credit || null,
        albumartists: item.albumartists || null,
        albumartists_credit: item.albumartists_credit || null,
        albumartist_sort: item.albumartist_sort || null,
        albumartists_sort: item.albumartists_sort || null,
        albumdisambig: item.albumdisambig || null,
        albumstatus: item.albumstatus || null,
        albumtype: item.albumtype || null,
        albumtypes: item.albumtypes || null,
        artpath: item.artpath || null,
        asin: item.asin || null,
        barcode: item.barcode || null,
        catalognum: item.catalognum || null,
        comp: item.comp || null,
        country: item.country || null,
        day: item.day || null,
        discogs_albumid: item.discogs_albumid || null,
        discogs_artistid: item.discogs_artistid || null,
        discogs_labelid: item.discogs_labelid || null,
        disctotal: item.disctotal || null,
        genres: Array.isArray(item.genres) ? item.genres.join(', ') : (item.genres || null),
        label: item.label || null,
        language: item.language || null,
        mb_albumartistid: item.mb_albumartistid || null,
        mb_albumartistids: item.mb_albumartistids || null,
        mb_albumid: item.mb_albumid || null,
        mb_releasegroupid: item.mb_releasegroupid || null,
        month: item.month || null,
        original_day: item.original_day || null,
        original_month: item.original_month || null,
        original_year: item.original_year || null,
        r128_album_gain: item.r128_album_gain || null,
        releasegroupdisambig: item.releasegroupdisambig || null,
        release_group_title: item.release_group_title || null,
        rg_album_gain: item.rg_album_gain || null,
        rg_album_peak: item.rg_album_peak || null,
        script: item.script || null,
        style: item.style || null,
        year: item.year || null,
        added: item.added,
        missing_since: null,
    }
}

function logImportPerf(item: Item, resolveMs: number, adoptMs: number): void {
    const label = `${item.artist || '?'} - ${item.title || '?'}`;
    const total = resolveMs + adoptMs;

    const sourceTimings: Array<{ name: string; ms: number; error: boolean }> =
        (item as any)._sourceTimings ?? [];
    const adoptTimings: Record<string, number> = (item as any)._adoptTimings ?? {};

    const sourceParts = sourceTimings
        .slice()
        .sort((a, b) => b.ms - a.ms)
        .map(s => `${s.name.replace('Source', '')}=${s.ms}ms${s.error ? '!' : ''}`)
        .join(' ');

    const adoptParts = Object.entries(adoptTimings)
        .sort(([, a], [, b]) => b - a)
        .map(([k, v]) => `${k}=${v}ms`)
        .join(' ');

    console.log(
        `[perf] ${label} | total=${total}ms` +
        ` resolve=${resolveMs}ms(${sourceParts})` +
        ` adopt=${adoptMs}ms(${adoptParts})`
    );
}

// Export a single instance (singleton)
export default new Repository();
