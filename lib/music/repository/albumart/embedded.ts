import { parseFile } from 'music-metadata';
import { AlbumArt } from '../types';

/**
 * Extracts embedded album art from audio file
 * @param filePath Path to audio file
 * @returns AlbumArt or null if no embedded art found
 */
export async function extractEmbeddedAlbumArt(filePath: string): Promise<AlbumArt | null> {
    try {
        const metadata = await parseFile(filePath);
        const picture = metadata.common.picture?.[0];

        if (!picture || !picture.data) {
            console.debug(`No embedded album art in: ${filePath}`);
            return null;
        }

        // Convert to Buffer if needed
        const buffer = Buffer.isBuffer(picture.data) ? picture.data : Buffer.from(picture.data);

        // Get dimensions if available
        const dimensions = await getImageDimensions(buffer);

        // Determine quality based on size
        let quality: 'high' | 'medium' | 'low' = 'medium';
        if (dimensions) {
            if (dimensions.width >= 500) quality = 'high';
            else if (dimensions.width < 300) quality = 'low';
        }

        return {
            buffer,
            mimeType: picture.format === 'image/png' ? 'image/png' : 'image/jpeg',
            source: 'embedded',
            quality,
            width: dimensions?.width,
            height: dimensions?.height
        };
    } catch (error) {
        console.warn('Failed to extract embedded album art:', error);
        return null;
    }
}

/**
 * Gets image dimensions from buffer
 */
async function getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number } | null> {
    try {
        // Check for JPEG
        if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
            return getJPEGDimensions(buffer);
        }

        // Check for PNG
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
            return getPNGDimensions(buffer);
        }

        return null;
    } catch (error) {
        return null;
    }
}

function getJPEGDimensions(buffer: Buffer): { width: number; height: number } | null {
    let offset = 2;

    while (offset < buffer.length) {
        if (buffer[offset] !== 0xFF) break;

        const marker = buffer[offset + 1];
        offset += 2;

        // SOF markers
        if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
            offset += 3;
            const height = buffer.readUInt16BE(offset);
            const width = buffer.readUInt16BE(offset + 2);
            return { width, height };
        }

        const length = buffer.readUInt16BE(offset);
        offset += length;
    }

    return null;
}

function getPNGDimensions(buffer: Buffer): { width: number; height: number } | null {
    if (buffer.length < 24) return null;

    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);

    return { width, height };
}
