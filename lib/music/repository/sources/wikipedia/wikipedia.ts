import { DataSource } from "../../types";
import { Item } from "../../../database";

const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php';

interface WikipediaSearchResult {
    pageid: number;
    title: string;
}

interface WikidataEntity {
    id: string;
    labels?: { [lang: string]: { value: string } };
    claims?: {
        P136?: Array<{ // genre
            mainsnak: {
                datavalue?: {
                    value: { id: string };
                };
            };
        }>;
        P495?: Array<{ // country of origin
            mainsnak: {
                datavalue?: {
                    value: { id: string };
                };
            };
        }>;
        P577?: Array<{ // publication date
            mainsnak: {
                datavalue?: {
                    value: { time: string };
                };
            };
        }>;
    };
}

export class WikipediaSource extends DataSource {
    readonly confidence = 0.65;

    async getData(item: Item): Promise<Item> {
        try {
            if (!item.artist || !item.album) {
                return item;
            }

            // Search for album page
            const wikidataId = await this.findWikidataId(item.artist, item.album);

            if (!wikidataId) {
                return item;
            }

            // Get Wikidata entity
            const entity = await this.getWikidataEntity(wikidataId);

            if (!entity) {
                return item;
            }

            // Extract genres
            const genres = await this.extractGenres(entity);

            // Extract year
            const year = this.extractYear(entity);

            return {
                ...item,
                genres: this.mergeGenres(item.genres, genres),
                year: year || item.year,
            };
        } catch (error) {
            console.debug(`Wikipedia lookup failed for ${item.path}:`, error);
            return item;
        }
    }

    private async findWikidataId(artist: string, album: string): Promise<string | null> {
        try {
            // Search Wikipedia for the album
            const searchQuery = encodeURIComponent(`${album} ${artist} album`);
            const searchUrl = `${WIKIPEDIA_API_URL}?action=query&list=search&srsearch=${searchQuery}&format=json&origin=*`;

            const searchResponse = await fetch(searchUrl);
            const searchData = await searchResponse.json();

            if (!searchData.query?.search?.length) {
                return null;
            }

            const pageTitle = searchData.query.search[0].title;

            // Get Wikidata ID from Wikipedia page
            const wikidataUrl = `${WIKIPEDIA_API_URL}?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageprops&format=json&origin=*`;
            const wikidataResponse = await fetch(wikidataUrl);
            const wikidataData = await wikidataResponse.json();

            const pages = wikidataData.query?.pages;
            if (!pages) return null;

            const page = Object.values(pages)[0] as any;
            return page?.pageprops?.wikibase_item || null;
        } catch (error) {
            console.debug('Wikipedia search failed:', error);
            return null;
        }
    }

    private async getWikidataEntity(wikidataId: string): Promise<WikidataEntity | null> {
        try {
            const url = `${WIKIDATA_API_URL}?action=wbgetentities&ids=${wikidataId}&format=json&origin=*`;
            const response = await fetch(url);
            const data = await response.json();

            return data.entities?.[wikidataId] || null;
        } catch (error) {
            console.debug('Wikidata fetch failed:', error);
            return null;
        }
    }

    private async extractGenres(entity: WikidataEntity): Promise<string[]> {
        const genres: string[] = [];

        if (!entity.claims?.P136) {
            return genres;
        }

        // Collect all genre IDs first
        const genreIds = entity.claims.P136
            .map(claim => claim.mainsnak.datavalue?.value.id)
            .filter((id): id is string => !!id);

        if (genreIds.length === 0) {
            return genres;
        }

        // Batch fetch all genre labels in one request (Wikidata supports up to 50 IDs)
        try {
            const url = `${WIKIDATA_API_URL}?action=wbgetentities&ids=${genreIds.join('|')}&format=json&origin=*`;
            const response = await fetch(url);
            const data = await response.json();

            // Extract labels from all entities (keep original casing)
            for (const genreId of genreIds) {
                const genreLabel = data.entities?.[genreId]?.labels?.en?.value;
                if (genreLabel) {
                    genres.push(genreLabel); // Keep original casing - let merger handle normalization
                }
            }
        } catch (error) {
            console.debug('Failed to fetch genre labels:', error);
        }

        return genres;
    }

    private extractYear(entity: WikidataEntity): number | null {
        const dateClaim = entity.claims?.P577?.[0];
        if (!dateClaim) return null;

        const dateString = dateClaim.mainsnak.datavalue?.value.time;
        if (!dateString) return null;

        // Wikidata time format: +YYYY-MM-DDT00:00:00Z
        const match = dateString.match(/\+(\d{4})-/);
        return match ? parseInt(match[1], 10) : null;
    }

    private mergeGenres(existing: string[] | null, newGenres: string[]): string[] {
        const merged = new Set<string>(existing || []);
        // Keep original casing - let merger handle normalization
        newGenres.forEach(g => merged.add(g));
        return Array.from(merged);
    }
}
