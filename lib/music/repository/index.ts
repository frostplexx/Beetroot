import { LastfmGenreSource } from "./sources/lastfm_genre/lastfm_genre";
import { LocalTagsSource } from "./sources/tags";
import { MusicBrainzSource } from "./sources/musicbrainz/musicbrainz";
import { DiscogsSource } from "./sources/discogs/discogs";
import { WikipediaSource } from "./sources/wikipedia/wikipedia";
import { LrclibSource } from "./sources/lrclib/lrclib";
import { DataSource, SourceResult } from "./types";
import { Item, Album, writeOrUpdateAlbum, writeOrUpdateItem } from "../database";
import { mergeData } from "./merger";


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

    /**
     * Enrich an item by merging data from all sources sequentially.
     * Sources with higher confidence run first.
     */
    private async enrichItem(item: Item): Promise<Item> {
        let enrichedItem = { ...item };

        for (const source of this.dataSources) {
            try {
                enrichedItem = await source.getData(enrichedItem);
            } catch (error) {
                console.error(`Error enriching with ${source.constructor.name}:`, error);
            }
        }

        return enrichedItem;
    }

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
    
    writeItemToDB(item: Item): void {
        // Extract album data from item and write/update album first
        const album = this.itemToAlbum(item)
        const albumId = writeOrUpdateAlbum(album)

        // Set the album_id on the item and write it
        item.album_id = albumId
        writeOrUpdateItem(item)
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


// test
async function testDataSources() {
    // const testFilePath = '/Users/daniel/Music/Download/stripped_brod.flac'; // Update with actual file path
    const testFilePath = '/Users/daniel/Music/BeetsTest/E-L/Ikkimel/POPPSTAR/01 WAS JETZT.flac'; // Update with actual file path
    // const testFilePath = '/Users/daniel/Music/BeetsTest/A-D/Bergënot/Moselfrankian Tänzelcore Madness/13 Schnake.flac'; // Update with actual file path
    // const testFilePath = '/Users/daniel/Music/BeetsTest/A-D/Bad Bunny/DeBÍ TiRAR MáS FOToS/04 PERFuMITO NUEVO.m4a'; // Update with actual file path


    const repository = Repository.getInstance();

    const item = await repository.resolveItem(testFilePath)

    console.log(item);

    repository.writeItemToDB(item);

}

// Run test with: npm run test:repository
testDataSources().catch(console.error);




