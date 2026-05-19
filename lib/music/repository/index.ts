import { LastfmGenreSource } from "./sources/lastfm_genre";
import { LocalTagsSource } from "./sources/tags";
import { MusicBrainzSource } from "./sources/musicbrainz/musicbrainz";
import { DataSource, SourceResult } from "./types";
import { Item } from "../database";


class Repository {
    private static instance: Repository;

    private readonly dataSources: DataSource[] = [
        new LocalTagsSource(),      // confidence: 1.0
        new MusicBrainzSource(),    // confidence: 0.85
        new LastfmGenreSource(),    // confidence: 0.7
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
     * Fetch data from each source separately, keeping results isolated.
     * This allows inspection of what each source contributes and makes it
     * easy to add new data sources without modifying this function.
     */
    async fetchFromAllSources(item: Item): Promise<SourceResult[]> {
        const results: SourceResult[] = [];

        for (const source of this.dataSources) {
            const startTime = Date.now();
            const sourceName = source.constructor.name;

            try {
                const data = await source.getData(item);
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

        return results;
    }

    /**
     * Enrich an item by merging data from all sources sequentially.
     * Sources with higher confidence run first.
     */
    async enrichItem(item: Item): Promise<Item> {
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
}

export default Repository.getInstance();


// test
async function testDataSources() {
    const testFilePath = '/Users/daniel/Music/Download/April Ethereal - Opeth.flac'; // Update with actual file path

    const testItem: Item = {
        id: 0,
        path: testFilePath,
        title: '',
        artist: '',
        album: '',
        source: 'test',
        missing_since: null,
        added: Date.now(),
        track: null,
        year: null,
    } as Item;

    console.log('\n=== Testing Data Sources ===');
    console.log(`File: ${testFilePath}\n`);

    const repository = Repository.getInstance();
    const results = await repository.fetchFromAllSources(testItem);

    for (const result of results) {
        console.log(`\n--- ${result.sourceName} (confidence: ${result.confidence}) ---`);
        console.log(`Duration: ${result.duration}ms`);

        if (result.error) {
            console.log(`Error: ${result.error.message}`);
        } else if (result.data) {
            console.log('Retrieved data:');
            console.log(`  Title: ${result.data.title || '(none)'}`);
            console.log(`  Artist: ${result.data.artist || '(none)'}`);
            console.log(`  Album: ${result.data.album || '(none)'}`);
            console.log(`  Track: ${result.data.track || '(none)'}`);
            console.log(`  Year: ${result.data.year || '(none)'}`);
            console.log(`  Genres: ${result.data.genres?.join(', ') || '(none)'}`);
            console.log(`  MusicBrainz ID: ${result.data.mb_trackid || '(none)'}`);
            console.log(`  AcoustID: ${result.data.acoustid_id || '(none)'}`);
        }
    }

    console.log('\n=== Test Complete ===\n');
}

// Uncomment to run test:
// testDataSources().catch(console.error);




