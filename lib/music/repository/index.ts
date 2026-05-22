import { LastfmGenreSource } from "./sources/lastfm_genre/lastfm_genre";
import { LocalTagsSource } from "./sources/tags";
import { MusicBrainzSource } from "./sources/musicbrainz/musicbrainz";
import { DiscogsSource } from "./sources/discogs/discogs";
import { WikipediaSource } from "./sources/wikipedia/wikipedia";
import { LrclibSource } from "./sources/lrclib/lrclib";
import { DataSource, ReconcileProgress, ReconcileResult, SourceResult } from "./types";
import { Item, Album, writeOrUpdateAlbum, writeOrUpdateItem, getItemsByAlbum, deleteItemFromDB, getAllItemPaths, batchUpdateItems, getItemsReadyForDeletion, batchDeleteItems, getAlbumsWithMissingArtwork, getAlbumById, checkAndUpdateAlbumMissingStatus, getItemById } from "../database";
import { mergeData } from "./merger";
import { writeBackItem, moveItem, moveFile } from "./writeback";
import { globalConfig } from "../../config";
import fsPromises from 'fs/promises';
import { enumerateMusicFilesStream } from "../utils/enumerate";
import { computeFileHashIfEnabled } from "../utils/hash";
import { handleCoverArt } from "./coverart";
import { checkForDuplicate } from "./duplicate-check";


class Repository {
    private static instance: Repository;

    private readonly dataSources: DataSource[] = [
        new LocalTagsSource(),      // confidence: 0.6
        new MusicBrainzSource(),    // confidence: 0.85 (adjusted by AcoustID score)
        new LrclibSource(),         // confidence: 0.8
        new DiscogsSource(),        // confidence: 0.75
        new LastfmGenreSource(),    // confidence: 0.7
        new WikipediaSource(),      // confidence: 0.65
    ];

    private constructor() {
    }

    // Singleton pattern
    static getInstance(): Repository {
        if (!Repository.instance) {
            Repository.instance = new Repository();
        }
        return Repository.instance;
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
            return await this._resolveItem(tmpItem);
        } else {
            return await this._resolveItem(pathOrItem);
        }
    }


    async adoptItem(item: Item): Promise<void> {
        try {
            // 1. Write tags to file (will throw on error)
            await writeBackItem(item, globalConfig.writeback_mode ?? 'missing-only');

            // 2. Move file if needed (separate step)
            moveItem(item);

            // 3. Compute file hash AFTER writeback and move (so hash matches final on-disk file)
            if (globalConfig.compute_file_hash) {
                item.file_hash = await computeFileHashIfEnabled(item.path, true) || undefined;
            }

            // 4. Write item to DB (creates/updates album)
            const albumId = this.writeItemToDB(item);

            // 5. Handle cover art at album level
            const album = getAlbumById(albumId);
            if (album && !album.artpath) {
                await handleCoverArt(album);
            }
        } catch (error) {
            // Log the error and re-throw to abort import
            console.error(`Adopt failed: ${item.path} - ${error instanceof Error ? error.message : String(error)}`);
            throw error;
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
            // Step 1: Load all DB paths into memory, filtered to music_directory scope
            const allDbPaths = getAllItemPaths(); // Map<path, id>
            const musicDir = globalConfig.music_directory.replace('~', process.env.HOME || '');

            // Filter to only paths within current music_directory
            const dbPaths = new Map<string, number>();
            for (const [path, id] of allDbPaths.entries()) {
                if (path.startsWith(musicDir)) {
                    dbPaths.set(path, id);
                }
            }

            const dbPathSet = new Set(dbPaths.keys());
            console.log(`Database: ${dbPaths.size} tracks in scope (${allDbPaths.size} total)`);

            // Step 2: Stream files and detect missing/new in a single pass
            const newFiles: string[] = [];
            const seenPaths = new Set<string>();

            for await (const filePath of enumerateMusicFilesStream()) {
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

            for (const [dbPath, itemId] of dbPaths.entries()) {
                if (!seenPaths.has(dbPath)) {
                    missingUpdates.push({
                        id: itemId,
                        fields: { missing_since: Date.now() }
                    });
                    result.missingFilesDetected++;
                }
            }

            // Batch update missing items
            if (missingUpdates.length > 0) {
                console.log(`Missing: ${missingUpdates.length} files marked`);

                // Collect unique album IDs that need to be checked
                const affectedAlbumIds = new Set<number>();

                for (let i = 0; i < missingUpdates.length; i += batchSize) {
                    const batch = missingUpdates.slice(i, i + batchSize);
                    batchUpdateItems(batch);

                    // Get album_id for each updated item
                    for (const update of batch) {
                        const item = getItemById(update.id);
                        if (item?.album_id) {
                            affectedAlbumIds.add(item.album_id);
                        }
                    }
                }

                // Check and update album missing status for all affected albums
                for (const albumId of affectedAlbumIds) {
                    checkAndUpdateAlbumMissingStatus(albumId);
                }
            }

            // Step 4: Import new files with concurrency control
            if (newFiles.length > 0) {
                console.log(`Importing: ${newFiles.length} files...`);

                // Pre-filter: check for duplicates before expensive metadata fetching
                const filesToImport: string[] = [];
                let skippedDuplicates = 0;

                for (const filePath of newFiles) {
                    const isDuplicate = await checkForDuplicate(filePath);
                    if (isDuplicate) {
                        skippedDuplicates++;
                    } else {
                        filesToImport.push(filePath);
                    }
                }

                if (skippedDuplicates > 0) {
                    console.log(`Skipped: ${skippedDuplicates} duplicates`);
                }

                // Process in batches with controlled concurrency
                for (let i = 0; i < filesToImport.length; i += concurrency) {
                    const batch = filesToImport.slice(i, i + concurrency);

                    const promises = batch.map(async (filePath) => {
                        try {
                            const item = await this.resolveItem(filePath);
                            await this.adoptItem(item);
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
     */
    private async fetchFromAllSources(item: Item): Promise<SourceResult[]> {
        const results: SourceResult[] = [];
        let enrichedItem = { ...item };

        // Check if we have minimal metadata needed for other sources
        const hasMinimalMetadata = (item: Item): boolean => {
            return !!(item.artist && item.album);
        };

        let remainingSources = [...this.dataSources];

        // Run sources sequentially until we have base metadata
        while (!hasMinimalMetadata(enrichedItem) && remainingSources.length > 0) {
            const source = remainingSources.shift()!;
            const startTime = Date.now();
            const sourceName = source.constructor.name;

            try {
                const data = await source.getData({ ...enrichedItem });
                const duration = Date.now() - startTime;

                results.push({
                    sourceName,
                    confidence: source.confidence,
                    data,
                    duration,
                });

                enrichedItem = data;
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

        // Run remaining sources in parallel with the enriched metadata
        if (remainingSources.length > 0) {
            const sourcePromises = remainingSources.map(async (source) => {
                const startTime = Date.now();
                const sourceName = source.constructor.name;

                try {
                    const data = await source.getData({ ...enrichedItem });
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

    private async _resolveItem(item: Item): Promise<Item> {
        const results = await this.fetchFromAllSources(item)
        const merged = mergeData(results)

        if (merged.error) {
            throw new Error(`Failed to fetch data from sources: ${merged.error.message}`);
        }
        if (merged.data == null) {
            throw new Error('Failed to merge data from sources');
        }

        return merged.data;
    }
    
    private writeItemToDB(item: Item): number {
        // Extract album data from item and write/update album first
        const album = this.itemToAlbum(item)
        const albumId = writeOrUpdateAlbum(album)

        // Set the album_id on the item and write it
        item.album_id = albumId
        writeOrUpdateItem(item)

        return albumId
    }


    private itemToAlbum(item: Item): Album {
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
        }
    }

}

export default Repository.getInstance();


