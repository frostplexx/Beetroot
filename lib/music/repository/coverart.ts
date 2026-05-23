import { Album, writeOrUpdateAlbum, getItemsByAlbum, updateAlbumArtpath } from "../database";
import { parseFile } from 'music-metadata';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { globalConfig } from "../../config";

// Get ffmpeg path - resolve relative to project root for Next.js compatibility
function getFfmpegPath(): string {
    try {
        const ffmpegStatic = require('ffmpeg-static');
        if (typeof ffmpegStatic === 'string' && path.isAbsolute(ffmpegStatic) && fs.existsSync(ffmpegStatic)) {
            return ffmpegStatic;
        }
    } catch (e) {
        // ffmpeg-static not available
    }

    const projectRoot = process.cwd();
    const ffmpegPath = path.join(projectRoot, 'node_modules/ffmpeg-static/ffmpeg');

    if (fs.existsSync(ffmpegPath)) {
        return ffmpegPath;
    }

    return 'ffmpeg';
}

interface CoverArtSource {
    name: string;
    fetch: (album: Album) => Promise<Buffer | null>;
}

/**
 * Fetch image from URL and return as Buffer
 * Includes timeout (15s) and size limit (5MB) to prevent abuse
 */
async function fetchImageFromUrl(url: string): Promise<Buffer | null> {
    const TIMEOUT_MS = 15_000;
    const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

    try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.debug(`Image fetch failed: ${url} (${response.status})`);
                return null;
            }

            // Check content length if available
            const contentLength = response.headers.get('content-length');
            if (contentLength && parseInt(contentLength) > MAX_SIZE_BYTES) {
                console.debug(`Image too large: ${url} (${contentLength} bytes)`);
                return null;
            }

            const arrayBuffer = await response.arrayBuffer();

            // Verify size after download
            if (arrayBuffer.byteLength > MAX_SIZE_BYTES) {
                console.debug(`Image too large after download: ${url} (${arrayBuffer.byteLength} bytes)`);
                return null;
            }

            return Buffer.from(arrayBuffer);
        } finally {
            clearTimeout(timeoutId);
        }
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.debug(`Image fetch timeout: ${url}`);
        } else {
            console.debug(`Image fetch error: ${url} - ${error instanceof Error ? error.message : String(error)}`);
        }
        return null;
    }
}

/**
 * iTunes Search API - No API key required
 */
async function fetchFromItunes(album: Album): Promise<Buffer | null> {
    try {
        // Use URLSearchParams to properly encode the search term
        const searchTerm = `${album.albumartist || ''} ${album.album || ''}`.trim();
        const params = new URLSearchParams({
            term: searchTerm,
            entity: 'album',
            limit: '5'
        });

        const searchUrl = `https://itunes.apple.com/search?${params.toString()}`;

        const response = await fetch(searchUrl);
        if (!response.ok) return null;

        const data = await response.json();

        if (data.results && data.results.length > 0) {
            // Get the first result's artwork URL
            const artworkUrl = data.results[0].artworkUrl100;
            if (artworkUrl) {
                // Replace 100x100 with 600x600 for higher resolution
                const highResUrl = artworkUrl.replace('100x100', '600x600');
                return await fetchImageFromUrl(highResUrl);
            }
        }

        return null;
    } catch (error) {
        console.debug(`iTunes API error: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

/**
 * Last.fm API
 */
async function fetchFromLastfm(album: Album): Promise<Buffer | null> {
    try {
        if (!globalConfig.lastfm_api_key) {
            console.debug('Last.fm API key not configured');
            return null;
        }

        const artist = encodeURIComponent(album.albumartist || '');
        const albumName = encodeURIComponent(album.album || '');

        const apiUrl = `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=${globalConfig.lastfm_api_key}&artist=${artist}&album=${albumName}&format=json`;

        const response = await fetch(apiUrl);
        if (!response.ok) return null;

        const data = await response.json();

        if (data.album && data.album.image) {
            // Get the largest image (last in array)
            const images = data.album.image;
            const largestImage = images[images.length - 1];

            if (largestImage && largestImage['#text']) {
                return await fetchImageFromUrl(largestImage['#text']);
            }
        }

        return null;
    } catch (error) {
        console.debug(`Last.fm API error: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

/**
 * Discogs API
 */
async function fetchFromDiscogs(album: Album): Promise<Buffer | null> {
    try {
        // If we have a Discogs album ID, use it directly
        if (album.discogs_albumid) {
            const releaseUrl = `https://api.discogs.com/releases/${album.discogs_albumid}`;
            const headers: Record<string, string> = {
                'User-Agent': 'Beetroot/0.1.0'
            };

            if (globalConfig.discogs_token) {
                headers['Authorization'] = `Discogs token=${globalConfig.discogs_token}`;
            }

            const response = await fetch(releaseUrl, { headers });
            if (!response.ok) return null;

            const data = await response.json();

            if (data.images && data.images.length > 0) {
                // Get the primary image or first image
                const primaryImage = data.images.find((img: any) => img.type === 'primary') || data.images[0];
                if (primaryImage && primaryImage.uri) {
                    return await fetchImageFromUrl(primaryImage.uri);
                }
            }
        } else {
            // Search for the release
            const artist = encodeURIComponent(album.albumartist || '');
            const albumName = encodeURIComponent(album.album || '');

            const searchUrl = `https://api.discogs.com/database/search?artist=${artist}&release_title=${albumName}&type=release`;
            const headers: Record<string, string> = {
                'User-Agent': 'Beetroot/0.1.0'
            };

            if (globalConfig.discogs_token) {
                headers['Authorization'] = `Discogs token=${globalConfig.discogs_token}`;
            }

            const response = await fetch(searchUrl, { headers });
            if (!response.ok) return null;

            const data = await response.json();

            if (data.results && data.results.length > 0) {
                const firstResult = data.results[0];
                if (firstResult.cover_image) {
                    return await fetchImageFromUrl(firstResult.cover_image);
                }
            }
        }

        return null;
    } catch (error) {
        console.debug(`Discogs API error: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

const SOURCES: CoverArtSource[] = [
    {
        name: 'itunes',
        fetch: fetchFromItunes
    },
    {
        name: 'lastfm',
        fetch: fetchFromLastfm
    },
    {
        name: 'discogs',
        fetch: fetchFromDiscogs
    }
];

/**
 * Extract embedded cover art from file (returns null if not present)
 * Combines check + extract to avoid double parseFile call
 */
async function extractEmbeddedCoverArt(filePath: string): Promise<{ hasArt: boolean; buffer: Buffer | null }> {
    try {
        const metadata = await parseFile(filePath);
        if (metadata.common.picture && metadata.common.picture.length > 0) {
            // Return the first (usually best quality) picture
            return {
                hasArt: true,
                buffer: metadata.common.picture[0].data
            };
        }
        return { hasArt: false, buffer: null };
    } catch (error) {
        // Silently handle missing files (ENOENT) - expected for duplicates/moved files
        if ((error as any)?.code === 'ENOENT') {
            console.debug(`File not found when extracting cover art: ${filePath}`);
        } else {
            console.error(`Error extracting cover art from ${filePath}:`, error);
        }
        return { hasArt: false, buffer: null };
    }
}

/**
 * Strip embedded cover art from file using ffmpeg
 */
function stripEmbeddedCoverArt(filePath: string): boolean {
    const ffmpegPath = getFfmpegPath();

    if (!ffmpegPath) {
        console.error('ffmpeg not found - install ffmpeg to strip embedded artwork');
        return false;
    }

    const ext = path.extname(filePath);
    const tempPath = filePath + '.stripping' + ext;

    try {
        // Copy file without cover art streams
        const args = [
            '-i', filePath,
            '-map', '0:a',           // Only copy audio streams
            '-c', 'copy',            // Copy without re-encoding
            '-map_metadata', '0',    // Copy metadata
            '-map_metadata:s:a', '0:s:a', // Copy audio stream metadata
            '-y',
            tempPath
        ];

        execFileSync(ffmpegPath, args, { stdio: 'pipe' });

        // Replace original with stripped version
        fs.renameSync(tempPath, filePath);
        return true;
    } catch (error) {
        console.error(`Strip artwork failed: ${filePath}`);
        // Clean up temp file if it exists
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
        return false;
    }
}

/**
 * Fetch cover art from external sources
 */
async function fetchCoverArtFromSources(album: Album): Promise<Buffer | null> {
    // Try each source until one succeeds
    for (const source of SOURCES) {
        try {
            const coverArt = await source.fetch(album);
            if (coverArt) {
                console.log(`Artwork: ${album.albumartist} - ${album.album} (from ${source.name})`);
                return coverArt;
            }
        } catch (error) {
            console.debug(`Artwork fetch failed from ${source.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return null;
}

/**
 * Get all unique directories for an album (handles multi-disc releases)
 */
function getAlbumDirectories(album: Album): string[] {
    try {
        // Get all items from album
        const items = getItemsByAlbum(album.id);
        if (items.length === 0) {
            console.debug(`No items found for album ${album.id}`);
            return [];
        }

        // Get unique directories (multi-disc albums may have tracks in subdirectories)
        const directories = new Set<string>();
        for (const item of items) {
            directories.add(path.dirname(item.path));
        }

        return Array.from(directories);
    } catch (error) {
        console.error(`Error getting album directories: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}

/**
 * Detect image format from buffer magic bytes
 */
function detectImageFormat(buffer: Buffer): 'jpg' | 'png' | 'webp' {
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'jpg';
    }
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'png';
    }
    // WebP: RIFF ... WEBP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return 'webp';
    }
    // Default to jpg if unknown
    return 'jpg';
}

/**
 * Save cover art to album directory with correct extension
 */
function saveCoverArt(coverArtData: Buffer, albumDir: string): string | null {
    try {
        // Ensure album directory exists
        if (!fs.existsSync(albumDir)) {
            fs.mkdirSync(albumDir, { recursive: true });
        }

        // Detect format from buffer magic bytes
        const format = detectImageFormat(coverArtData);

        // Save with correct extension
        const coverPath = path.join(albumDir, `cover.${format}`);
        fs.writeFileSync(coverPath, coverArtData);

        return coverPath;
    } catch (error) {
        console.error(`Save artwork failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

/**
 * Strip embedded cover art from all tracks in an album
 */
async function stripEmbeddedCoverArtFromAlbum(album: Album): Promise<Buffer | null> {
    let extractedCoverArt: Buffer | null = null;

    try {
        const items = getItemsByAlbum(album.id);

        for (const item of items) {
            // Extract and check in one call (avoids double parseFile)
            const { hasArt, buffer } = await extractEmbeddedCoverArt(item.path);

            if (hasArt) {
                // Save from first file that has it (as fallback)
                if (!extractedCoverArt && buffer) {
                    extractedCoverArt = buffer;
                }

                // Strip embedded cover art from file
                const stripped = stripEmbeddedCoverArt(item.path);
                if (!stripped) {
                    console.error(`Strip embedded artwork failed: ${item.path}`);
                }
            }
        }

        return extractedCoverArt;
    } catch (error) {
        console.error(`Strip embedded artwork failed: ${error instanceof Error ? error.message : String(error)}`);
        return extractedCoverArt;
    }
}

/**
 * Main cover art handler for albums:
 * 1. Strip embedded cover art from all tracks if it exists
 * 2. Fetch cover art from external sources
 * 3. Save to album directory and update database
 */
export async function handleCoverArt(album: Album): Promise<boolean> {
    try {
        let coverArtData: Buffer | null = null;

        // Step 1: Strip embedded cover art from all tracks in album
        const extractedCoverArt = await stripEmbeddedCoverArtFromAlbum(album);
        if (extractedCoverArt) {
            coverArtData = extractedCoverArt;
        }

        // Step 2: Try to fetch higher quality cover art from external sources
        const externalCoverArt = await fetchCoverArtFromSources(album);
        if (externalCoverArt) {
            coverArtData = externalCoverArt;
        }

        // Step 3: If we have cover art (either extracted or fetched), save it
        if (coverArtData) {
            const albumDirs = getAlbumDirectories(album);
            if (albumDirs.length === 0) {
                console.error(`Artwork failed: could not determine directories for ${album.albumartist} - ${album.album}`);
                return false;
            }

            const coverPath = saveCoverArt(coverArtData, albumDirs);
            if (coverPath) {
                // Update only the artpath field (focused update to avoid lost-update bugs)
                updateAlbumArtpath(album.id, coverPath);

                return true;
            }
        }

        // If no cover art found or all operations failed - not a critical failure
        return true;

    } catch (error) {
        console.error(`Artwork failed: ${album.albumartist} - ${album.album} - ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}
