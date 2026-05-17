import { TrackData, WriteBackResult } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Writes track metadata back to file tags
 * Note: This is a placeholder implementation. Full implementation would require:
 * - node-id3 for MP3
 * - flac-tagger for FLAC
 * - music-metadata for M4A
 */
export async function writeTagsToFile(
    filePath: string,
    track: TrackData
): Promise<WriteBackResult> {
    try {
        const ext = path.extname(filePath).toLowerCase();

        switch (ext) {
            case '.mp3':
                return await writeMp3Tags(filePath, track);
            case '.flac':
                return await writeFlacTags(filePath, track);
            case '.m4a':
            case '.mp4':
                return await writeM4aTags(filePath, track);
            default:
                return {
                    status: 'skipped',
                    reason: `Unsupported file format: ${ext}`,
                };
        }
    } catch (error) {
        return {
            status: 'error',
            reason: 'Failed to write tags',
            error: error as Error,
        };
    }
}

/**
 * Writes MP3 tags using ID3v2.4
 * TODO: Install and use node-id3 library
 */
async function writeMp3Tags(filePath: string, track: TrackData): Promise<WriteBackResult> {
    // Placeholder - would use node-id3
    console.warn('MP3 tag writing not yet implemented - requires node-id3');
    return {
        status: 'skipped',
        reason: 'MP3 tag writing not yet implemented',
    };

    // Example implementation with node-id3:
    /*
    const NodeID3 = require('node-id3');

    const tags = {
        title: track.title,
        artist: track.artists?.join(', '),
        album: track.album,
        year: track.year?.toString(),
        trackNumber: track.trackNumber?.toString(),
        genre: track.genres?.join(', '),
        ISRC: track.isrc,
    };

    const success = NodeID3.write(tags, filePath);
    if (!success) {
        throw new Error('Failed to write ID3 tags');
    }

    return { status: 'ok' };
    */
}

/**
 * Writes FLAC tags
 * TODO: Install and use flac-tagger library
 */
async function writeFlacTags(filePath: string, track: TrackData): Promise<WriteBackResult> {
    // Placeholder - would use flac-tagger
    console.warn('FLAC tag writing not yet implemented - requires flac-tagger');
    return {
        status: 'skipped',
        reason: 'FLAC tag writing not yet implemented',
    };

    // Example implementation with flac-tagger:
    /*
    const flac = require('flac-tagger');

    await flac.tag(filePath, {
        TITLE: track.title,
        ARTIST: track.artists?.join(', '),
        ALBUM: track.album,
        DATE: track.year?.toString(),
        TRACKNUMBER: track.trackNumber?.toString(),
        GENRE: track.genres?.join(', '),
        ISRC: track.isrc,
    });

    return { status: 'ok' };
    */
}

/**
 * Writes M4A/MP4 tags
 * TODO: Install and use appropriate library
 */
async function writeM4aTags(filePath: string, track: TrackData): Promise<WriteBackResult> {
    // Placeholder
    console.warn('M4A tag writing not yet implemented');
    return {
        status: 'skipped',
        reason: 'M4A tag writing not yet implemented',
    };
}

/**
 * Creates full file path (without extension) for a track based on path template
 * Template syntax matches beets config
 *
 * Examples:
 * - '$albumartist/$album/$track $title'
 * - '%bucket{$albumartist,alpha}/$albumartist/$album/$track $title'
 * - 'Compilations/$album/$track $title' (for compilations)
 */
export function createFullPath(
    track: TrackData,
    template: string,
    baseDir: string
): string {
    console.log('    → Creating full path from template...');
    console.log('      Template:', template);
    console.log('      Base dir:', baseDir);

    let result = template;

    // Handle bucket function
    console.log('      → Processing bucket functions...');
    const bucketRegex = /%bucket\{([^,]+),alpha\}/g;
    result = result.replace(bucketRegex, (match, field) => {
        // Remove leading $ from field name
        const fieldName = field.startsWith('$') ? field.substring(1) : field;
        const value = getFieldValue(track, fieldName);
        const bucket = getAlphaBucket(value);
        console.log(`        %bucket{${field}} = "${value}" → "${bucket}"`);
        return bucket;
    });

    // Replace field variables
    console.log('      → Replacing field variables...');
    const fieldRegex = /\$(\w+)/g;
    result = result.replace(fieldRegex, (match, field) => {
        const value = getFieldValue(track, field);
        const sanitized = sanitizePathComponent(value);
        console.log(`        $${field} = "${value}" → "${sanitized}"`);
        return sanitized;
    });

    const fullPath = path.join(baseDir, result);
    console.log('      → Final path (without extension):', fullPath);
    return fullPath;
}

/**
 * Gets field value from track
 */
function getFieldValue(track: TrackData, field: string): string {
    const fieldMap: Record<string, any> = {
        albumartist: track.albumArtist,
        artist: track.artists?.[0],
        album: track.album,
        title: track.title,
        track: track.trackNumber?.toString().padStart(2, '0'),
        disc: track.discNumber?.toString(),
    };

    return fieldMap[field] || '';
}

/**
 * Gets alphabetic bucket for a value, matching beets' behavior
 * Buckets: A-D (4), E-L (8), M-R (6), S-Z (8)
 */
function getAlphaBucket(value: string): string {
    if (!value) return 'Unknown';

    const first = value.charAt(0).toUpperCase();
    const code = first.charCodeAt(0);

    // Check if it's a letter
    if (code >= 65 && code <= 90) {
        // A=65, Z=90
        if (code <= 68) return 'A-D';      // A-D: 65-68
        if (code <= 76) return 'E-L';      // E-L: 69-76
        if (code <= 82) return 'M-R';      // M-R: 77-82
        return 'S-Z';                       // S-Z: 83-90
    }

    // Non-alphabetic characters
    return '0-9';
}

/**
 * Sanitizes a path component by removing invalid characters
 */
function sanitizePathComponent(value: string): string {
    if (!value) return 'Unknown';

    // Remove or replace invalid characters
    return value
        .replace(/[<>:"|?*]/g, '')  // Remove invalid filename chars
        .replace(/\//g, '-')         // Replace slashes
        .replace(/\\/g, '-')         // Replace backslashes
        .trim();
}

/**
 * Moves a track file to its proper location based on path template
 */
export async function moveTrackToLocation(
    track: TrackData,
    template: string,
    baseDir: string
): Promise<string> {
    console.log('    → Moving track to organized location...');
    console.log('      Current location:', track.filePath);

    // The template includes both directory and filename parts
    // We need to build the full path from the template, including the filename
    const fullPathWithoutExt = createFullPath(track, template, baseDir);
    const ext = path.extname(track.filePath);
    const targetPath = fullPathWithoutExt + ext;
    const targetDir = path.dirname(targetPath);

    console.log('      Target directory:', targetDir);
    console.log('      Full target path:', targetPath);

    // Create directory if it doesn't exist
    console.log('      → Creating directory structure...');
    await fs.promises.mkdir(targetDir, { recursive: true });
    console.log('      ✓ Directory ready');

    // Move file
    if (track.filePath !== targetPath) {
        console.log('      → Moving file...');
        try {
            await fs.promises.rename(track.filePath, targetPath);
            console.log('      ✓ File moved successfully');
        } catch (error) {
            console.error('      ✗ File move failed:', error);
            throw error;
        }
    } else {
        console.log('      ℹ File already at target location, no move needed');
    }

    return targetPath;
}
