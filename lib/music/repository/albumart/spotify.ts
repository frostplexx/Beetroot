import { AlbumArt } from '../types';

interface SpotifyTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

interface SpotifySearchResult {
    albums: {
        items: Array<{
            id: string;
            name: string;
            artists: Array<{ name: string }>;
            images: Array<{
                url: string;
                height: number;
                width: number;
            }>;
        }>;
    };
}

// Token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Gets Spotify access token using Client Credentials flow
 * Requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET env vars or config
 */
async function getSpotifyToken(clientId?: string, clientSecret?: string): Promise<string> {
    // Check cache
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
        return cachedToken.token;
    }

    // Get credentials from env or config
    const id = clientId || process.env.SPOTIFY_CLIENT_ID;
    const secret = clientSecret || process.env.SPOTIFY_CLIENT_SECRET;

    if (!id || !secret) {
        throw new Error('Spotify credentials not configured (SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET)');
    }

    // Request token
    const auth = Buffer.from(`${id}:${secret}`).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
        throw new Error(`Spotify token request failed: ${response.status}`);
    }

    const data: SpotifyTokenResponse = await response.json();

    // Cache token (expires_in is in seconds)
    cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in - 60) * 1000 // Refresh 60s early
    };

    return data.access_token;
}

/**
 * Fetches album art from Spotify API
 * @param artist Artist name
 * @param album Album name
 * @param size Preferred size ('large', 'medium', 'small')
 * @returns AlbumArt or null if not found
 */
export async function fetchSpotifyAlbumArt(
    artist: string,
    album: string,
    size: 'large' | 'medium' | 'small' = 'large',
    clientId?: string,
    clientSecret?: string
): Promise<AlbumArt | null> {
    if (!artist || !album) return null;

    try {
        // Get access token
        const token = await getSpotifyToken(clientId, clientSecret);

        // Search for album
        const searchTerm = `album:${album} artist:${artist}`;
        const params = new URLSearchParams({
            q: searchTerm,
            type: 'album',
            limit: '5'
        });

        const searchUrl = `https://api.spotify.com/v1/search?${params}`;
        const searchResponse = await fetch(searchUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!searchResponse.ok) {
            throw new Error(`Spotify API returned ${searchResponse.status}`);
        }

        const data: SpotifySearchResult = await searchResponse.json();

        if (!data.albums || data.albums.items.length === 0) {
            console.debug(`No Spotify results for: ${artist} - ${album}`);
            return null;
        }

        // Find best match
        const bestMatch = findBestMatch(data.albums.items, artist, album);

        if (!bestMatch || !bestMatch.images || bestMatch.images.length === 0) {
            console.debug(`No good Spotify match or no images for: ${artist} - ${album}`);
            return null;
        }

        // Select image by size preference
        const image = selectImageBySize(bestMatch.images, size);

        if (!image) {
            return null;
        }

        // Fetch the image
        const imageResponse = await fetch(image.url);

        if (!imageResponse.ok) {
            throw new Error(`Failed to fetch Spotify image: ${imageResponse.status}`);
        }

        const buffer = Buffer.from(await imageResponse.arrayBuffer());
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

        return {
            buffer,
            mimeType: contentType.includes('png') ? 'image/png' : 'image/jpeg',
            source: 'spotify',
            quality: image.width >= 500 ? 'high' : image.width >= 300 ? 'medium' : 'low',
            width: image.width,
            height: image.height,
            url: image.url
        };
    } catch (error) {
        // Don't warn if credentials not configured
        if ((error as Error).message?.includes('Spotify credentials')) {
            console.debug('Spotify album art fetch skipped: credentials not configured');
        } else {
            console.warn('Failed to fetch from Spotify:', error);
        }
        return null;
    }
}

/**
 * Finds best matching album from Spotify results
 */
function findBestMatch(
    items: SpotifySearchResult['albums']['items'],
    artist: string,
    album: string
): SpotifySearchResult['albums']['items'][0] | null {
    if (items.length === 0) return null;

    const normalizedArtist = normalize(artist);
    const normalizedAlbum = normalize(album);

    // Exact match
    const exactMatch = items.find(item =>
        item.artists.some(a => normalize(a.name) === normalizedArtist) &&
        normalize(item.name) === normalizedAlbum
    );

    if (exactMatch) return exactMatch;

    // Partial match
    const partialMatch = items.find(item =>
        item.artists.some(a => normalize(a.name).includes(normalizedArtist)) &&
        normalize(item.name).includes(normalizedAlbum)
    );

    if (partialMatch) return partialMatch;

    // First result
    return items[0];
}

/**
 * Selects image by size preference
 */
function selectImageBySize(
    images: Array<{ url: string; width: number; height: number }>,
    size: 'large' | 'medium' | 'small'
): { url: string; width: number; height: number } | null {
    if (images.length === 0) return null;

    // Sort by width descending
    const sorted = [...images].sort((a, b) => b.width - a.width);

    switch (size) {
        case 'large':
            // Return largest
            return sorted[0];
        case 'medium':
            // Return middle or ~300px
            return sorted.find(img => img.width <= 400 && img.width >= 200) || sorted[Math.floor(sorted.length / 2)];
        case 'small':
            // Return smallest or ~100px
            return sorted[sorted.length - 1];
        default:
            return sorted[0];
    }
}

/**
 * Normalizes string for comparison
 */
function normalize(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Clears the cached Spotify token (useful for testing)
 */
export function clearSpotifyTokenCache(): void {
    cachedToken = null;
}
