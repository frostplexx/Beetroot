import { AlbumArt } from '../types';

interface iTunesSearchResult {
    resultCount: number;
    results: Array<{
        collectionId: number;
        collectionName: string;
        artistName: string;
        artworkUrl100: string;
        artworkUrl60: string;
    }>;
}

/**
 * Fetches album art from iTunes API
 * @param artist Artist name
 * @param album Album name
 * @param size Desired size (default: 600px, can request up to 1200+)
 * @returns AlbumArt or null if not found
 */
export async function fetchItunesAlbumArt(
    artist: string,
    album: string,
    size: number = 1200
): Promise<AlbumArt | null> {
    if (!artist || !album) return null;

    try {
        // Search iTunes for the album
        const searchTerm = `${artist} ${album}`.trim();
        const params = new URLSearchParams({
            term: searchTerm,
            entity: 'album',
            limit: '5',
            media: 'music'
        });

        const searchUrl = `https://itunes.apple.com/search?${params}`;
        const searchResponse = await fetch(searchUrl);

        if (!searchResponse.ok) {
            throw new Error(`iTunes API returned ${searchResponse.status}`);
        }

        const data: iTunesSearchResult = await searchResponse.json();

        if (data.resultCount === 0) {
            console.debug(`No iTunes results for: ${searchTerm}`);
            return null;
        }

        // Find best match (exact match preferred)
        const bestMatch = findBestMatch(data.results, artist, album);

        if (!bestMatch) {
            console.debug(`No good iTunes match for: ${searchTerm}`);
            return null;
        }

        // iTunes artwork URL format: remove size and replace with desired size
        // Example: https://is1-ssl.mzstatic.com/image/.../100x100bb.jpg
        // Replace 100x100bb with {size}x{size}bb
        let artworkUrl = bestMatch.artworkUrl100
            .replace(/100x100bb/, `${size}x${size}bb`)
            .replace(/60x60bb/, `${size}x${size}bb`);

        // Fetch the artwork
        const artResponse = await fetch(artworkUrl);

        if (!artResponse.ok) {
            throw new Error(`Failed to fetch iTunes artwork: ${artResponse.status}`);
        }

        const buffer = Buffer.from(await artResponse.arrayBuffer());
        const contentType = artResponse.headers.get('content-type') || 'image/jpeg';

        return {
            buffer,
            mimeType: contentType.includes('png') ? 'image/png' : 'image/jpeg',
            source: 'itunes',
            quality: size >= 1000 ? 'high' : size >= 500 ? 'medium' : 'low',
            width: size,
            height: size,
            url: artworkUrl
        };
    } catch (error) {
        console.warn('Failed to fetch from iTunes:', error);
        return null;
    }
}

/**
 * Finds the best matching album from iTunes results
 */
function findBestMatch(
    results: iTunesSearchResult['results'],
    artist: string,
    album: string
): iTunesSearchResult['results'][0] | null {
    if (results.length === 0) return null;

    const normalizedArtist = normalize(artist);
    const normalizedAlbum = normalize(album);

    // Try exact match first
    const exactMatch = results.find(result =>
        normalize(result.artistName) === normalizedArtist &&
        normalize(result.collectionName) === normalizedAlbum
    );

    if (exactMatch) return exactMatch;

    // Try partial match
    const partialMatch = results.find(result =>
        normalize(result.artistName).includes(normalizedArtist) &&
        normalize(result.collectionName).includes(normalizedAlbum)
    );

    if (partialMatch) return partialMatch;

    // Return first result as fallback
    return results[0];
}

/**
 * Normalizes string for comparison
 */
function normalize(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove special chars
        .replace(/\s+/g, ' ')     // Normalize spaces
        .trim();
}
