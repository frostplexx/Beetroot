import * as fs from 'fs';
import * as path from 'path';
import { AlbumArt, AlbumArtOptions, AlbumArtSource } from '../types';
import { extractEmbeddedAlbumArt } from './embedded';
import { fetchCoverArtArchive } from './musicbrainz';
import { fetchItunesAlbumArt } from './itunes';
import { fetchSpotifyAlbumArt } from './spotify';

export { extractEmbeddedAlbumArt } from './embedded';
export { fetchCoverArtArchive } from './musicbrainz';
export { fetchItunesAlbumArt } from './itunes';
export { fetchSpotifyAlbumArt } from './spotify';

interface FetchContext {
    filePath?: string;
    releaseId?: string;
    artist?: string;
    album?: string;
}

/**
 * Album Art Manager
 * Orchestrates fetching from multiple sources with fallback logic
 */
export class AlbumArtManager {
    private defaultSources: AlbumArtSource[] = [
        'embedded',
        'coverartarchive',
        'itunes',
        'spotify'
    ];

    /**
     * Fetches album art from multiple sources with fallback
     */
    async fetchAlbumArt(
        context: FetchContext,
        options: AlbumArtOptions = {}
    ): Promise<AlbumArt | null> {
        const sources = options.preferredSources || this.defaultSources;
        const minWidth = options.minWidth || 300;
        const minHeight = options.minHeight || 300;

        for (const source of sources) {
            try {
                const art = await this.fetchFromSource(source, context);

                if (art && this.meetsQualityRequirements(art, minWidth, minHeight)) {
                    console.log(`✓ Album art found from ${source}: ${art.width}x${art.height}`);
                    return art;
                }

                if (art) {
                    console.debug(`Album art from ${source} doesn't meet quality requirements`);
                }
            } catch (error) {
                console.warn(`Failed to fetch from ${source}:`, error);
            }
        }

        console.warn('No suitable album art found from any source');
        return null;
    }

    /**
     * Fetches from a specific source
     */
    private async fetchFromSource(
        source: AlbumArtSource,
        context: FetchContext
    ): Promise<AlbumArt | null> {
        switch (source) {
            case 'embedded':
                if (!context.filePath) return null;
                return await extractEmbeddedAlbumArt(context.filePath);

            case 'coverartarchive':
                if (!context.releaseId) return null;
                return await fetchCoverArtArchive(context.releaseId);

            case 'itunes':
                if (!context.artist || !context.album) return null;
                return await fetchItunesAlbumArt(context.artist, context.album);

            case 'spotify':
                if (!context.artist || !context.album) return null;
                return await fetchSpotifyAlbumArt(context.artist, context.album);

            default:
                return null;
        }
    }

    /**
     * Checks if album art meets quality requirements
     */
    private meetsQualityRequirements(
        art: AlbumArt,
        minWidth: number,
        minHeight: number
    ): boolean {
        if (!art.width || !art.height) {
            // If dimensions unknown, accept it
            return true;
        }

        return art.width >= minWidth && art.height >= minHeight;
    }

    /**
     * Saves album art to disk
     * @param art Album art to save
     * @param albumFolder Folder where album files are stored
     * @returns Path to saved file
     */
    async saveAlbumArt(art: AlbumArt, albumFolder: string): Promise<string> {
        // Ensure directory exists
        await fs.promises.mkdir(albumFolder, { recursive: true });

        // Determine filename
        const ext = art.mimeType === 'image/png' ? 'png' : 'jpg';
        const coverPath = path.join(albumFolder, `cover.${ext}`);

        // Check if cover already exists
        if (fs.existsSync(coverPath)) {
            console.debug(`Cover already exists at ${coverPath}, skipping`);
            return coverPath;
        }

        // Write file
        await fs.promises.writeFile(coverPath, art.buffer);
        console.log(`✓ Saved album art to ${coverPath} (${art.width}x${art.height} from ${art.source})`);

        return coverPath;
    }

    /**
     * Fetches and saves album art in one operation
     */
    async fetchAndSave(
        context: FetchContext,
        albumFolder: string,
        options: AlbumArtOptions = {}
    ): Promise<string | null> {
        // Set saveToFile default to true
        const opts = { ...options, saveToFile: true };

        const art = await this.fetchAlbumArt(context, opts);

        if (!art) {
            return null;
        }

        return await this.saveAlbumArt(art, albumFolder);
    }

    /**
     * Gets the folder path for an album based on track data
     */
    getAlbumFolder(filePath: string): string {
        return path.dirname(filePath);
    }
}

// Export singleton instance
export const albumArtManager = new AlbumArtManager();

/**
 * Convenience function for quick album art fetching
 */
export async function getAlbumArt(
    filePath: string,
    releaseId?: string,
    artist?: string,
    album?: string,
    options?: AlbumArtOptions
): Promise<AlbumArt | null> {
    return albumArtManager.fetchAlbumArt(
        { filePath, releaseId, artist, album },
        options
    );
}

/**
 * Convenience function for fetching and saving album art
 */
export async function getAndSaveAlbumArt(
    filePath: string,
    releaseId?: string,
    artist?: string,
    album?: string,
    options?: AlbumArtOptions
): Promise<string | null> {
    const albumFolder = path.dirname(filePath);
    return albumArtManager.fetchAndSave(
        { filePath, releaseId, artist, album },
        albumFolder,
        options
    );
}
