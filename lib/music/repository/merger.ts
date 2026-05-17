import { ScoredTrackData, TrackData, SyncConflict, DataSource, ConflictResolution } from './types';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Genre canonicalization tree (simplified - full tree would be loaded from YAML)
type GenreTree = Record<string, string[]>;

/**
 * Merges multiple ScoredTrackData sources into a single TrackData
 * Returns merged data and any conflicts found
 */
export function mergeTrackData(
    sources: ScoredTrackData[],
    existingData?: Partial<TrackData>,
    existingSources?: Partial<Record<keyof TrackData, DataSource>>,
    conflictResolution: ConflictResolution = 'keep-db'
): { merged: TrackData; conflicts: Omit<SyncConflict, 'trackId' | 'timestamp'>[] } {
    console.log('  → Merge process starting...');
    console.log('    Sources:', sources.map(s => `${s.source} (conf=${s.confidence})`).join(', '));
    console.log('    Conflict resolution:', conflictResolution);
    console.log('    Has existing data:', !!existingData);

    const merged: any = {};
    const conflicts: Omit<SyncConflict, 'trackId' | 'timestamp'>[] = [];
    const fieldSources: Partial<Record<keyof TrackData, DataSource>> = {};

    // Get all unique fields across sources
    const allFields = new Set<keyof TrackData>();
    sources.forEach(source => {
        Object.keys(source.data).forEach(key => allFields.add(key as keyof TrackData));
    });

    console.log('    Fields to merge:', Array.from(allFields).join(', '));

    const fieldArray = Array.from(allFields);
    for (const field of fieldArray) {
        // Skip special fields
        if (field === 'genres') continue; // Handle genres separately

        // Get values from all sources
        const values = sources
            .filter(s => s.data[field] !== undefined)
            .map(s => ({ value: s.data[field], confidence: s.confidence, source: s.source }))
            .sort((a, b) => b.confidence - a.confidence); // Highest confidence first

        if (values.length === 0) continue;

        // Check for conflicts
        const uniqueValues = new Set(values.map(v => JSON.stringify(v.value)));

        if (uniqueValues.size > 1 && existingData && existingData[field] !== undefined) {
            // Conflict detected
            const dbValue = existingData[field];
            const dbSource = existingSources?.[field] || 'database';
            const fileValue = values.find(v => v.source === 'tags')?.value;
            const mbValue = values.find(v => v.source === 'musicbrainz')?.value;

            // Only flag as conflict if values actually differ
            if (JSON.stringify(dbValue) !== JSON.stringify(fileValue) ||
                (mbValue && JSON.stringify(dbValue) !== JSON.stringify(mbValue))) {
                console.log(`    ⚠ CONFLICT on field "${field}":`, { dbValue, fileValue, mbValue });
                conflicts.push({
                    field,
                    dbValue,
                    dbSource,
                    fileValue,
                    mbValue,
                });

                // Apply conflict resolution
                let resolvedValue: any;
                let resolvedSource: DataSource;
                switch (conflictResolution) {
                    case 'keep-db':
                        resolvedValue = dbValue;
                        resolvedSource = dbSource;
                        console.log(`    → Resolved: keeping DB value (${dbSource})`);
                        merged[field] = resolvedValue as any;
                        fieldSources[field] = resolvedSource;
                        continue;
                    case 'keep-file':
                        if (fileValue !== undefined) {
                            resolvedValue = fileValue;
                            resolvedSource = 'tags';
                            console.log(`    → Resolved: keeping file value`);
                            merged[field] = resolvedValue as any;
                            fieldSources[field] = resolvedSource;
                            continue;
                        }
                        break;
                    case 'keep-mb':
                        if (mbValue !== undefined) {
                            resolvedValue = mbValue;
                            resolvedSource = 'musicbrainz';
                            console.log(`    → Resolved: keeping MusicBrainz value`);
                            merged[field] = resolvedValue as any;
                            fieldSources[field] = resolvedSource;
                            continue;
                        }
                        break;
                    case 'manual':
                        console.log(`    → Resolved: flagged for manual resolution, keeping DB value for now`);
                        // Keep DB value for now, user will resolve manually
                        merged[field] = dbValue as any;
                        fieldSources[field] = dbSource;
                        continue;
                }
            }
        }

        // No conflict or conflict resolved - use highest confidence value
        merged[field] = values[0].value as any;
        fieldSources[field] = values[0].source;
    }

    // Handle genres separately with canonicalization
    console.log('    → Processing genres...');
    const genreSources = sources.filter(s => s.data.genres && s.data.genres.length > 0);
    if (genreSources.length > 0) {
        const allGenres = genreSources.flatMap(s => s.data.genres || []);
        console.log('      Raw genres:', allGenres);
        merged.genres = canonicalizeGenres(allGenres);
        console.log('      Canonicalized:', merged.genres);
        fieldSources.genres = genreSources[0].source; // Use source of first genre provider
    } else {
        console.log('      No genres found in sources');
    }

    // Handle duration specially - prefer file tags over MusicBrainz
    console.log('    → Processing duration...');
    const tagsDuration = sources.find(s => s.source === 'tags')?.data.duration;
    if (tagsDuration !== undefined) {
        console.log('      Using file tags duration:', tagsDuration);
        merged.duration = tagsDuration;
        fieldSources.duration = 'tags';
    }

    // Ensure filePath is set
    if (!merged.filePath) {
        console.log('    → FilePath not set, using first source');
        merged.filePath = sources[0]?.data.filePath || '';
    }

    // Calculate file hash
    console.log('    → Calculating file hash...');
    if (merged.filePath) {
        merged.fileHash = calculateFileHash(merged.filePath);
        console.log('      Hash:', merged.fileHash);
    }

    console.log('  ✓ Merge complete:', {
        conflictsFound: conflicts.length,
        fieldsSet: Object.keys(merged).length
    });

    return {
        merged: merged as TrackData,
        conflicts
    };
}

/**
 * Canonicalizes genres by filtering against whitelist and applying tree hierarchy
 */
function canonicalizeGenres(genres: string[]): string[] {
    // Load genre whitelist (in real implementation, load from file)
    const whitelist = getGenreWhitelist();

    // Normalize and filter
    const normalized = genres
        .map(g => g.toLowerCase().trim())
        .filter(g => whitelist.has(g));

    // Remove duplicates
    const unique = Array.from(new Set(normalized));

    // Apply canonicalization tree (more specific genres replace general ones)
    // For now, just return filtered unique genres
    // TODO: Load and apply genres-tree.yaml for proper canonicalization
    return unique;
}

/**
 * Gets the genre whitelist
 * TODO: Load from https://raw.githubusercontent.com/beetbox/beets/master/beetsplug/lastgenre/genres.txt
 */
function getGenreWhitelist(): Set<string> {
    // Simplified whitelist - in production, load from file
    return new Set([
        'rock', 'pop', 'jazz', 'classical', 'electronic', 'hip hop', 'metal',
        'folk', 'blues', 'country', 'r&b', 'soul', 'funk', 'reggae', 'punk',
        'indie', 'alternative', 'experimental', 'ambient', 'dance', 'house',
        'techno', 'trance', 'dubstep', 'drum and bass', 'trap', 'edm',
        'death metal', 'black metal', 'progressive rock', 'psychedelic',
    ]);
}

/**
 * Calculates MD5 hash of first 128KB of file
 */
function calculateFileHash(filePath: string): string {
    try {
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(128 * 1024); // 128KB
        const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
        fs.closeSync(fd);

        const hash = crypto.createHash('md5');
        hash.update(buffer.slice(0, bytesRead));
        return hash.digest('hex');
    } catch (error) {
        console.warn('Failed to calculate file hash:', error);
        return '';
    }
}

/**
 * Normalizes string for comparison (lowercase, trimmed)
 */
export function normalizeForComparison(value: string): string {
    return value.toLowerCase().trim();
}
