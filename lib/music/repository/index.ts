import { LastfmGenreSource } from "./sources/lastfm_genre/lastfm_genre";
import { LocalTagsSource } from "./sources/tags";
import { MusicBrainzSource } from "./sources/musicbrainz/musicbrainz";
import { DiscogsSource } from "./sources/discogs/discogs";
import { WikipediaSource } from "./sources/wikipedia/wikipedia";
import { DataSource, SourceResult } from "./types";
import { Item } from "../database";
import { mergeData } from "./merger";


class Repository {
    private static instance: Repository;

    private readonly dataSources: DataSource[] = [
        new LocalTagsSource(),      // confidence: 1.0
        new MusicBrainzSource(),    // confidence: 0.85 (adjusted by AcoustID score)
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


}

export default Repository.getInstance();


// test
async function testDataSources() {
    // const testFilePath = '/Users/daniel/Music/Download/stripped_brod.flac'; // Update with actual file path
    const testFilePath = '/Users/daniel/Music/BeetsTest/E-L/Ikkimel/POPPSTAR/01 WAS JETZT.flac'; // Update with actual file path
    // const testFilePath = '/Users/daniel/Music/BeetsTest/A-D/Bergënot/Moselfrankian Tänzelcore Madness/13 Schnake.flac'; // Update with actual file path
    // const testFilePath = '/Users/daniel/Music/BeetsTest/A-D/Bad Bunny/DeBÍ TiRAR MáS FOToS/04 PERFuMITO NUEVO.m4a'; // Update with actual file path


    const repository = Repository.getInstance();
}

// Run test with: npm run test:repository
testDataSources().catch(console.error);




