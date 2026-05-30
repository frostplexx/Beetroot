/**
 * Normalization utilities for album/artist matching
 *
 * Uses the same pattern as merger.ts for consistency:
 * - Convert to lowercase
 * - Trim whitespace
 * - Remove all non-alphanumeric characters
 */

/**
 * Normalize album or artist name for matching
 *
 * Examples:
 * - "Bad Bunny" → "badbunny"
 * - "Bad Bunny (Album)" → "badbunnyalbum"
 * - "K-Pop Demon Hunters" → "kpopdemonhunters"
 * - "  Album  " → "album"
 * - null/undefined → ""
 */
export function normalizeAlbumString(value: string | null | undefined): string {
    if (!value) return '';
    return value.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}
