import * as path from 'path';

/**
 * Expands ~ to home directory and resolves relative paths
 */
export function expandPath(filePath: string): string {
    if (!filePath) return filePath;

    // Expand ~ to home directory
    if (filePath.startsWith('~')) {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        filePath = filePath.replace('~', homeDir);
    }

    // Resolve to absolute path
    return path.resolve(filePath);
}
