import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * Compute SHA256 hash of a file's contents
 * Uses streaming to handle large files efficiently without loading into memory
 *
 * @param filePath - Absolute path to the file
 * @returns Promise resolving to hex-encoded SHA256 hash
 */
export async function computeFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);

        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (error) => reject(error));
    });
}

/**
 * Compute hash only if enabled in config
 * Returns null on error instead of throwing to allow import to continue
 *
 * @param filePath - Absolute path to the file
 * @param enabled - Whether hash computation is enabled
 * @returns Promise resolving to hash string or null
 */
export async function computeFileHashIfEnabled(filePath: string, enabled: boolean): Promise<string | null> {
    if (!enabled) return null;

    try {
        return await computeFileHash(filePath);
    } catch (error) {
        console.error(`Failed to compute hash for ${filePath}:`, error);
        return null;
    }
}
