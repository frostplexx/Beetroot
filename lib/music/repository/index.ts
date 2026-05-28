import { LastfmGenreSource } from "./sources/lastfm_genre/lastfm_genre";
import { LocalTagsSource } from "./sources/tags";
import { MusicBrainzSource, lookupReleaseForCluster, applyClusterReleaseToItem } from "./sources/musicbrainz/musicbrainz";
import { DiscogsSource } from "./sources/discogs/discogs";
import { WikipediaSource } from "./sources/wikipedia/wikipedia";
import { LrclibSource } from "./sources/lrclib/lrclib";
import { ReplayGain } from "./sources/replaygain";
import { DataSource, ReconcileProgress, ReconcileResult, SourceResult } from "./types";
import { Item, Album, writeOrUpdateAlbum, writeOrUpdateItem, getItemsByAlbum, deleteItemFromDB, getAllItemPaths, batchUpdateItems, getItemsReadyForDeletion, batchDeleteItems, getAlbumsWithMissingArtwork, getAlbumById, checkAndUpdateAlbumMissingStatus, getItemById } from "../database";
import { mergeData } from "./merger";
import { writeBackItem, moveItem, moveFile, computeTargetPath } from "./writeback";
import { globalConfig } from "../../config";
import fsPromises from 'fs/promises';
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
    async adoptItem(item: Item): Promise<void> {
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
                return;
            }

            // Phase 5: Move file (only if target differs from original)
            t = Date.now();
            if (originalPath !== targetPath) {
                const moved = moveFile(originalPath, targetPath);
                if (!moved) {
                    throw new AdoptionError(
                        `File move failed: ${originalPath} → ${targetPath}`,
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

        } catch (error) {
            // Rollback DB if file move failed after DB commit
            if (dbCommitted && itemId) {
                console.error(`Adoption failed after DB commit, rolling back item ${itemId}`);
                try {
                    db.transaction(() => {
                        deleteItemFromDB(itemId!);
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
        // Mark item as missing in DB (don't delete immediately to allow for recovery)
        item.marked_for_deletion = Date.now();

        // Move item to trash directory
        const trash = globalConfig.trash_directory ? globalConfig.trash_directory : `${globalConfig.music_directory}/.trash`;
        const trashPath = item.path.replace(globalConfig.music_directory, trash);

        // Check if move succeeded before updating DB
        const moveSucceeded = moveFile(item.path, trashPath);
        if (!moveSucceeded) {
            throw new Error(`Failed to move ${item.path} to trash at ${trashPath}`);
        }

        // Update item path to new location in trash
        item.path = trashPath;
        writeOrUpdateItem(item);
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

    markAlbumForDeletion(albumId: number): void {
        // Get all items for album
        const items = getItemsByAlbum(albumId);
        
        // Mark each item for deletion
        // This will move files to trash and update DB records
        items.forEach(item => this.markItemForDeletion(item));
    }


    // Runs full reconciliation: detect missing, import new, cleanup trash
    async reconcile(options?: {
        concurrency?: number;
        batchSize?: number;
        progressCallback?: (progress: ReconcileProgress) => void;
    }): Promise<ReconcileResult> {
        const concurrency = options?.concurrency ?? 10;
        const batchSize = options?.batchSize ?? 100;
        const progressCallback = options?.progressCallback;

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

        console.log(`Reconciling: ${globalConfig.music_directory}`);

        try {
            // Step 1: Load DB paths filtered to music_directory scope (filter pushed to SQL)
            const musicDir = globalConfig.music_directory.replace('~', process.env.HOME || '');
            const dbPaths = getAllItemPaths(musicDir); // Map<path, { id, album_id }>
            const dbPathSet = new Set(dbPaths.keys());
            console.log(`Database: ${dbPaths.size} tracks in scope`);

            // Step 2: Stream files and detect missing/new in a single pass
            const newFiles: string[] = [];
            const seenPaths = new Set<string>();

            for await (const filePath of enumerateMusicFilesStream(undefined, globalConfig.watch_directories ?? [])) {
                result.scannedFiles++;
                seenPaths.add(filePath);

                // Check if file is new
                if (!dbPathSet.has(filePath)) {
                    newFiles.push(filePath);
                    result.newFilesFound++;
                }

                // Report progress every 1000 files
                if (result.scannedFiles % 1000 === 0 && progressCallback) {
                    progressCallback({ ...result, phase: 'scanning' });
                }
            }

            console.log(`Scanned: ${result.scannedFiles} files (${newFiles.length} new)`);

            // Step 3: Detect missing files (in DB but not on disk)
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
            if (newFiles.length > 0) {
                console.log(`Importing: ${newFiles.length} files...`);

                // Pre-filter: check for duplicates in parallel with bounded concurrency
                const filesToImport: string[] = [];
                let skippedDuplicates = 0;

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
                }

                const clusters = clusterTracks(tagged);
                console.log(`Clustering: ${tagged.length} files → ${clusters.length} clusters`);

                for (const cluster of clusters) {
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
                                await this.adoptItem(item);
                                const adoptMs = Date.now() - t1;
                                logImportPerf(item, resolveMs, adoptMs);
                                result.newFilesImported++;
                            } catch (error) {
                                const errorMsg = `Import failed: ${seeded.path} - ${error instanceof Error ? error.message : String(error)}`;
                                console.error(errorMsg);
                                result.errors.push(errorMsg);
                            }
                        });
                        await Promise.all(promises);
                        if (progressCallback) {
                            progressCallback({ ...result, phase: 'importing' });
                        }
                    }
                }

                // Files whose tag pre-read failed bypass clustering entirely
                // and fall back to the original per-file path.
                for (let i = 0; i < tagFailed.length; i += concurrency) {
                    const batch = tagFailed.slice(i, i + concurrency);
                    const promises = batch.map(async (filePath) => {
                        try {
                            const t0 = Date.now();
                            const item = await this.resolveItem(filePath);
                            const resolveMs = Date.now() - t0;
                            const t1 = Date.now();
                            await this.adoptItem(item);
                            const adoptMs = Date.now() - t1;
                            logImportPerf(item, resolveMs, adoptMs);
                            result.newFilesImported++;
                        } catch (error) {
                            const errorMsg = `Import failed: ${filePath} - ${error instanceof Error ? error.message : String(error)}`;
                            console.error(errorMsg);
                            result.errors.push(errorMsg);
                        }
                    });
                    await Promise.all(promises);
                    if (progressCallback) {
                        progressCallback({ ...result, phase: 'importing' });
                    }
                }
            }

            // Step 5: Fix missing artwork (album-level)
            const albumsWithMissingArtwork = getAlbumsWithMissingArtwork();
            result.missingArtworkDetected = albumsWithMissingArtwork.length;

            if (albumsWithMissingArtwork.length > 0) {
                console.log(`Artwork: fetching for ${albumsWithMissingArtwork.length} albums...`);

                // Process in batches with controlled concurrency
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
                        }
                    });

                    await Promise.all(promises);

                    if (progressCallback) {
                        progressCallback({ ...result, phase: 'fixing-artwork' });
                    }
                }

                if (result.artworkFixed > 0) {
                    console.log(`Artwork: fixed ${result.artworkFixed}/${result.missingArtworkDetected}`);
                }
            }

            // Step 6: Clean up trash (delete items older than delete_after days)
            const itemsToDelete = getItemsReadyForDeletion(globalConfig.delete_after);

            if (itemsToDelete.length > 0) {
                console.log(`Cleanup: deleting ${itemsToDelete.length} items older than ${globalConfig.delete_after} days`);
                for (const item of itemsToDelete) {
                    try {
                        await this.deleteItem(item);
                        result.deletedItems++;
                    } catch (error) {
                        const errorMsg = `Delete failed: ${item.path} - ${error instanceof Error ? error.message : String(error)}`;
                        console.error(errorMsg);
                        result.errors.push(errorMsg);
                    }
                }
            }

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
        // Permanently delete item from DB and filesystem

        const trash = globalConfig.trash_directory ? globalConfig.trash_directory : `${globalConfig.music_directory}/.trash`;

        if (item.marked_for_deletion && item.path.startsWith(trash) && (Date.now() - item.marked_for_deletion) > globalConfig.delete_after * 24 * 60 * 60 * 1000) {
            // Delete file from filesystem
            try {
                await fsPromises.unlink(item.path)
                if (item.artpath) {
                    await fsPromises.unlink(item.artpath).catch(() => {}) // Ignore if art doesn't exist
                }
            } catch (error) {
                console.error(`Delete failed: ${item.path} - ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }

            // Delete item from DB
            deleteItemFromDB(item.id);
        } else {
            // This should not happen - log as debug since it's a logic error, not user-actionable
            console.debug(`Delete skipped: item ${item.id} not eligible (marked: ${item.marked_for_deletion}, path: ${item.path})`);
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
