import { Album, writeOrUpdateAlbum, getItemsByAlbum } from "../database";
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
 */
async function fetchImageFromUrl(url: string): Promise<Buffer | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`Failed to fetch image from ${url}: ${response.status}`);
            return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error(`Error fetching image from ${url}:`, error);
        return null;
    }
}

/**
 * iTunes Search API - No API key required
 */
async function fetchFromItunes(album: Album): Promise<Buffer | null> {
    try {
        const artist = encodeURIComponent(album.albumartist || '');
        const albumName = encodeURIComponent(album.album || '');

        const searchUrl = `https://itunes.apple.com/search?term=${artist}+${albumName}&entity=album&limit=5`;

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
        console.error('iTunes API error:', error);
        return null;
    }
}

/**
 * Last.fm API
 */
async function fetchFromLastfm(album: Album): Promise<Buffer | null> {
    try {
        if (!globalConfig.lastfm_api_key) {
            console.warn('Last.fm API key not configured');
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
        console.error('Last.fm API error:', error);
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
        console.error('Discogs API error:', error);
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
 * Check if file has embedded cover art using music-metadata
 */
async function hasEmbeddedCoverArt(filePath: string): Promise<boolean> {
    try {
        const metadata = await parseFile(filePath);
        return !!(metadata.common.picture && metadata.common.picture.length > 0);
    } catch (error) {
        // Silently handle missing files (ENOENT) - expected for duplicates/moved files
        if ((error as any)?.code === 'ENOENT') {
            console.debug(`File not found when checking for embedded cover art: ${filePath}`);
        } else {
            console.error(`Error reading metadata from ${filePath}:`, error);
        }
        return false;
    }
}

/**
 * Extract embedded cover art from file
 */
async function extractEmbeddedCoverArt(filePath: string): Promise<Buffer | null> {
    try {
        const metadata = await parseFile(filePath);
        if (metadata.common.picture && metadata.common.picture.length > 0) {
            // Return the first (usually best quality) picture
            return metadata.common.picture[0].data;
        }
        return null;
    } catch (error) {
        // Silently handle missing files (ENOENT) - expected for duplicates/moved files
        if ((error as any)?.code === 'ENOENT') {
            console.debug(`File not found when extracting cover art: ${filePath}`);
        } else {
            console.error(`Error extracting cover art from ${filePath}:`, error);
        }
        return null;
    }
}

/**
 * Strip embedded cover art from file using ffmpeg
 */
function stripEmbeddedCoverArt(filePath: string): boolean {
    const ffmpegPath = getFfmpegPath();

    if (!ffmpegPath) {
        console.error('ffmpeg not found');
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
        console.error(`Error stripping cover art from ${filePath}:`, error);
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
            console.log(`Trying to fetch cover art from ${source.name} for ${album.albumartist} - ${album.album}...`);
            const coverArt = await source.fetch(album);
            if (coverArt) {
                console.log(`Successfully fetched cover art from ${source.name}`);
                return coverArt;
            }
        } catch (error) {
            console.warn(`Failed to fetch from ${source.name}:`, error);
        }
    }
    return null;
}

/**
 * Get the album directory from the first track in the album
 */
function getAlbumDirectory(album: Album): string | null {
    try {
        // Get first item from album to determine directory
        const items = getItemsByAlbum(album.id);
        if (items.length === 0) {
            console.warn(`No items found for album ${album.id}`);
            return null;
        }

        // Use the directory of the first track
        return path.dirname(items[0].path);
    } catch (error) {
        console.error(`Error getting album directory:`, error);
        return null;
    }
}

/**
 * Save cover art to album directory
 */
function saveCoverArt(coverArtData: Buffer, albumDir: string): string | null {
    try {
        // Ensure album directory exists
        if (!fs.existsSync(albumDir)) {
            fs.mkdirSync(albumDir, { recursive: true });
        }

        // Save as cover.jpg in the album directory
        const coverPath = path.join(albumDir, 'cover.jpg');
        fs.writeFileSync(coverPath, coverArtData);

        return coverPath;
    } catch (error) {
        console.error(`Error saving cover art:`, error);
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
            const hasEmbedded = await hasEmbeddedCoverArt(item.path);

            if (hasEmbedded) {
                console.log(`Found embedded cover art in ${item.path}`);

                // Extract from first file that has it (as fallback)
                if (!extractedCoverArt) {
                    extractedCoverArt = await extractEmbeddedCoverArt(item.path);
                }

                // Strip embedded cover art from file
                const stripped = stripEmbeddedCoverArt(item.path);
                if (!stripped) {
                    console.warn(`Failed to strip embedded cover art from ${item.path}`);
                }
            }
        }

        return extractedCoverArt;
    } catch (error) {
        console.error(`Error stripping embedded cover art from album:`, error);
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
            console.log(`Extracted embedded cover art from album tracks`);
        }

        // Step 2: Try to fetch higher quality cover art from external sources
        const externalCoverArt = await fetchCoverArtFromSources(album);
        if (externalCoverArt) {
            coverArtData = externalCoverArt;
        }

        // Step 3: If we have cover art (either extracted or fetched), save it
        if (coverArtData) {
            const albumDir = getAlbumDirectory(album);
            if (!albumDir) {
                console.warn(`Could not determine album directory for album ${album.id}`);
                return false;
            }

            const coverPath = saveCoverArt(coverArtData, albumDir);
            if (coverPath) {
                // Update album with new artpath
                album.artpath = coverPath;

                // Write to database
                writeOrUpdateAlbum(album);

                console.log(`Cover art saved to ${coverPath} for ${album.albumartist} - ${album.album}`);
                return true;
            }
        }

        // If no cover art found or all operations failed
        console.log(`No cover art available for ${album.albumartist} - ${album.album}`);
        return true; // Not a critical failure

    } catch (error) {
        console.error(`Error handling cover art for album ${album.id}:`, error);
        return false;
    }
}
