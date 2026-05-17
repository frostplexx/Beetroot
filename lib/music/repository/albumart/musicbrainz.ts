import { AlbumArt } from '../types';

/**
 * Fetches album art from MusicBrainz Cover Art Archive
 * @param releaseId MusicBrainz release ID
 * @returns AlbumArt or null if not found
 */
export async function fetchCoverArtArchive(releaseId: string): Promise<AlbumArt | null> {
    if (!releaseId) return null;

    try {
        const url = `https://coverartarchive.org/release/${releaseId}/front`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Beetroot/0.1.0 (https://github.com/yourusername/beetroot)'
            },
            redirect: 'follow'
        });

        if (!response.ok) {
            if (response.status === 404) {
                console.debug(`No cover art found for release ${releaseId}`);
                return null;
            }
            throw new Error(`Cover Art Archive returned ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'image/jpeg';

        // Try to get image dimensions
        const dimensions = await getImageDimensions(buffer);

        return {
            buffer,
            mimeType: contentType.includes('png') ? 'image/png' : 'image/jpeg',
            source: 'coverartarchive',
            quality: 'high', // Cover Art Archive generally has high quality
            width: dimensions?.width,
            height: dimensions?.height,
            url
        };
    } catch (error) {
        console.warn('Failed to fetch from Cover Art Archive:', error);
        return null;
    }
}

/**
 * Gets image dimensions from buffer (simple implementation)
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
        // Check for marker
        if (buffer[offset] !== 0xFF) break;

        const marker = buffer[offset + 1];
        offset += 2;

        // SOF markers
        if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
            offset += 3; // Skip length and precision
            const height = buffer.readUInt16BE(offset);
            const width = buffer.readUInt16BE(offset + 2);
            return { width, height };
        }

        // Skip to next marker
        const length = buffer.readUInt16BE(offset);
        offset += length;
    }

    return null;
}

function getPNGDimensions(buffer: Buffer): { width: number; height: number } | null {
    // PNG dimensions are at bytes 16-23
    if (buffer.length < 24) return null;

    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);

    return { width, height };
}
