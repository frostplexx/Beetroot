import { Item } from "../database";
import { SourceResult } from "./types";
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';


export function mergeData<T extends SourceResult>(items: T[]): T {
    // Filter out items with no data
    const validItems = items.filter(item => item.data != null);
    if (validItems.length === 0) return items[0];

    // Start with the highest confidence source
    let merged: T = validItems[0];

    if (merged.data == null) {
        console.warn(`Warning: Highest confidence source "${merged.sourceName}" returned null data. Falling back to next source.`);
        merged = validItems[1] || merged; // Fallback to next source if available
    }


    // Collect all unique keys across all sources
    const allKeys = new Set<string>();
    for (const item of validItems) {
        if (item.data == null) continue;

        Object.keys(item.data).forEach(key => allKeys.add(key));
    }

    // Track which keys need conflict resolution
    const conflictKeys = new Set<string>();

    // First pass: collect all values and detect conflicts
    for (const key of allKeys) {
        if (key === 'path') continue; // Skip path, it's always the same

        if (merged.data == null) {
            console.warn(`Warning: Merged data is null when processing key "${key}". Skipping.`);
            continue;
        }

        // Special handling for genres
        if (key === 'genres') {
            merged.data[key] = resolveGenres(validItems);
            continue;
        }

        // Collect all non-null string values for this key
        const values = validItems
            .map(item => item.data == null ? "" : item.data[key])
            .filter(v => v != null && typeof v === 'string' && v.trim() !== '');

        if (values.length === 0) continue;
        if (values.length === 1) {
            merged.data[key] = values[0];
            continue;
        }

        // Check if there are conflicts (different values)
        const uniqueValues = new Set(values);
        if (uniqueValues.size === 1) {
            // All values are identical
            merged.data[key] = values[0];
            continue;
        }

        // Check similarity between values
        let hasConflict = false;
        const firstValue = values[0];
        for (let i = 1; i < values.length; i++) {
            const distance = calculateLevenshteinDistance(firstValue, values[i]);
            const maxLength = Math.max(firstValue.length, values[i].length);
            const similarity = 1 - distance / maxLength;

            if (similarity <= 0.8) {
                hasConflict = true;
                console.warn(`Merge conflict for key "${key}": "${firstValue}" vs "${values[i]}" (similarity: ${similarity.toFixed(2)})`);
                break;
            }
        }

        if (hasConflict) {
            conflictKeys.add(key);
        } else {
            // Similar enough, pick highest confidence
            const highestConfItem = validItems
                .filter(item => item.data[key] != null)
                .sort((a, b) => b.confidence - a.confidence)[0];
            merged.data[key] = highestConfItem.data[key];
        }
    }

    // Second pass: resolve conflicts once for each conflicted key
    for (const key of conflictKeys) {
        merged.data[key] = resolveConflict(key, validItems);
    }

    console.log("===========================")
    console.log(merged.data)

    return merged;
}


function calculateLevenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = a[j - 1].toLowerCase() === b[i - 1].toLowerCase() ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,    // Deletion
                matrix[i][j - 1] + 1,    // Insertion
                matrix[i - 1][j - 1] + cost // Substitution
            );
        }
    }

    const distance = matrix[b.length][a.length];
    const maxLen = Math.max(a.length, b.length);
    const similarity = maxLen > 0 ? 1 - distance / maxLen : 1;

    console.log(`[Levenshtein] "${a}" vs "${b}" -> distance: ${distance}, similarity: ${similarity.toFixed(2)}`);

    return distance;
}


function resolveConflict(key: string, sources: SourceResult[]): any {
    console.log(`[Conflict Resolution] Resolving conflict for key: "${key}"`);

    // Check what each source says, normalized to lowercase, a trimmed and only alphanumeric
    // Pick the value that most sources agree on, then use the highest confidence source for the non-normalized return
    // If no value has majority agreement, use the value from the source with the highest confidence

    const normalizedValues: Record<string, { count: number, originalValues: any[], confidence: number[], sources: Array<{name: string, confidence: number}> }> = {};

    for (const source of sources) {
        const value = source.data?.[key];
        if (typeof value === 'string') {
            const normalized = value.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
            console.log(`  [${source.sourceName}] confidence: ${source.confidence}, value: "${value}", normalized: "${normalized}"`);

            if (!normalizedValues[normalized]) {
                normalizedValues[normalized] = { count: 0, originalValues: [], confidence: [], sources: [] };
            }
            normalizedValues[normalized].count++;
            normalizedValues[normalized].originalValues.push(value);
            normalizedValues[normalized].confidence.push(source.confidence);
            normalizedValues[normalized].sources.push({ name: source.sourceName, confidence: source.confidence });
        }
    }

    console.log(`  Normalized value groups:`);
    for (const norm of Object.keys(normalizedValues)) {
        const group = normalizedValues[norm];
        console.log(`    "${norm}": ${group.count} sources`);
        group.sources.forEach((src, i) => {
            console.log(`      - ${src.name} (conf: ${src.confidence.toFixed(3)}): "${group.originalValues[i]}"`);
        });
    }

    let bestValue: any = null;
    let bestScore = -1;
    let bestInfo = { normalized: '', avgConfidence: 0, count: 0 };

    // Calculate confidence-weighted score for each normalized value
    for (const normalized in normalizedValues) {
        const { count, originalValues, confidence } = normalizedValues[normalized];

        const avgConfidence = confidence.reduce((sum, c) => sum + c, 0) / count;
        const maxConfidence = Math.max(...confidence);

        // Combine max confidence with consensus: give 10% boost per additional agreeing source
        // This ensures high-quality sources win, but consensus provides a tiebreaker boost
        const consensusBoost = 1 + 0.1 * (count - 1);
        const score = maxConfidence * consensusBoost;

        console.log(`  [${normalized}] count: ${count}, avgConf: ${avgConfidence.toFixed(3)}, maxConf: ${maxConfidence.toFixed(3)}, boost: ${consensusBoost.toFixed(2)}, score: ${score.toFixed(3)}`);

        if (score > bestScore) {
            bestScore = score;
            // Pick the highest confidence source from this group
            const index = confidence.indexOf(maxConfidence);
            bestValue = originalValues[index];
            bestInfo = { normalized, avgConfidence, count };
        }
    }

    if (bestValue !== null) {
        console.log(`  -> Winner: "${bestValue}" (normalized: "${bestInfo.normalized}", avgConf: ${bestInfo.avgConfidence.toFixed(3)}, sources: ${bestInfo.count})`);
    } else {
        // Shouldn't happen, but fallback to highest confidence source
        let maxConfidence = -1;
        let maxSource = '';
        for (const source of sources) {
            const value = source.data?.[key];
            if (value !== undefined && source.confidence > maxConfidence) {
                bestValue = value;
                maxConfidence = source.confidence;
                maxSource = source.sourceName;
            }
        }
        console.log(`  -> Fallback: "${bestValue}" from ${maxSource} (confidence: ${maxConfidence})`);
    }

    return bestValue;
}


function resolveGenres(sources: SourceResult[]): string[] {
    const genresWithSource: Array<{ genre: string, confidence: number }> = [];

    // Prefer Last.fm for genres, but fall back to all sources if Last.fm has none
    let useAllSources = true;

    // First try Last.fm only
    for (const source of sources) {
        if (source.sourceName !== 'LastfmGenreSource') continue;

        const value = source.data?.genres;
        if (Array.isArray(value) && value.length > 0) {
            console.log(`  [${source.sourceName}] genres: ${value.join(', ')}`);
            genresWithSource.push(...value.map(g => ({ genre: g, confidence: source.confidence })));
            useAllSources = false;
        } else if (typeof value === 'string' && value.trim().length > 0) {
            console.log(`  [${source.sourceName}] genres: ${value}`);
            genresWithSource.push(...(value as string).split(',').map(g => ({ genre: g.trim(), confidence: source.confidence })));
            useAllSources = false;
        }
    }

    // If Last.fm provided no genres, use all sources
    if (useAllSources) {
        console.log(`  Last.fm provided no genres, falling back to all sources`);
        for (const source of sources) {
            const value = source.data?.genres;
            if (Array.isArray(value)) {
                console.log(`  [${source.sourceName}] genres: ${value.join(', ')}`);
                genresWithSource.push(...value.map(g => ({ genre: g, confidence: source.confidence })));
            } else if (typeof value === 'string') {
                console.log(`  [${source.sourceName}] genres: ${value}`);
                genresWithSource.push(...(value as string).split(',').map(g => ({ genre: g.trim(), confidence: source.confidence })));
            }
        }
    }

    // Build map of normalized -> original capitalization (prefer highest confidence)
    const originalCasing = new Map<string, { original: string, confidence: number }>();
    for (const { genre, confidence } of genresWithSource) {
        // Normalize: lowercase, trim, remove non-alphanumeric (same as resolveConflict)
        const normalized = genre.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        if (normalized.length === 0) continue;

        if (!originalCasing.has(normalized)) {
            originalCasing.set(normalized, { original: genre, confidence });
        } else {
            // Keep the version from the highest confidence source
            const existing = originalCasing.get(normalized)!;
            if (confidence > existing.confidence) {
                originalCasing.set(normalized, { original: genre, confidence });
            }
        }
    }

    const normalizedGenres = Array.from(originalCasing.keys());
    console.log(`  Collected ${normalizedGenres.length} unique genres: [${normalizedGenres.join(', ')}]`);

    // Load genres-tree.yaml which contains a mapping of genre -> parent genres
    const genresTreePath = path.join(__dirname, 'genres-tree.yaml');
    const genresTree = yaml.load(fs.readFileSync(genresTreePath, 'utf8'));

    // Build parent-child relationships: child -> set of all parents
    const parentMap = new Map<string, Set<string>>();

    function buildParentMap(node: any, parents: string[] = []) {
        if (node == null) {
            // Handle null/undefined nodes
            return;
        } else if (Array.isArray(node)) {
            for (const item of node) {
                buildParentMap(item, parents);
            }
        } else if (typeof node === 'object') {
            for (const [key, value] of Object.entries(node)) {
                // Normalize: lowercase, trim, remove non-alphanumeric
                const genre = key.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

                // Record all parents for this genre
                if (!parentMap.has(genre)) {
                    parentMap.set(genre, new Set());
                }
                for (const parent of parents) {
                    parentMap.get(genre)!.add(parent);
                }

                // Recurse with this genre added to parents
                buildParentMap(value, [...parents, genre]);
            }
        } else if (typeof node === 'string') {
            // Normalize: lowercase, trim, remove non-alphanumeric
            const genre = node.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

            // Record all parents for this leaf genre
            if (!parentMap.has(genre)) {
                parentMap.set(genre, new Set());
            }
            for (const parent of parents) {
                parentMap.get(genre)!.add(parent);
            }
        }
    }

    buildParentMap(genresTree);

    // Filter to only genres that exist in the tree, then expand with their parents
    const allGenres = new Set<string>();
    const unknownGenres: string[] = [];

    for (const genre of normalizedGenres) {
        // Only keep genres that are in the tree
        if (parentMap.has(genre)) {
            allGenres.add(genre);
            const parents = parentMap.get(genre);
            if (parents) {
                for (const parent of parents) {
                    allGenres.add(parent);
                }
            }
        } else {
            unknownGenres.push(originalCasing.get(genre)?.original || genre);
        }
    }

    if (unknownGenres.length > 0) {
        console.log(`  Filtered out ${unknownGenres.length} unknown genres: [${unknownGenres.join(', ')}]`);
    }
    console.log(`  After expanding with parents: [${Array.from(allGenres).join(', ')}]`);

    // Delete all parent genres and only keep leafs
    const leafGenres = new Set(allGenres);
    for (const genre of allGenres) {
        const parents = parentMap.get(genre);
        if (parents) {
            for (const parent of parents) {
                leafGenres.delete(parent);
            }
        }
    }

    // Map back to original capitalization
    const result = Array.from(leafGenres).map(normalized =>
        originalCasing.get(normalized)?.original || normalized
    );
    console.log(`  Final leaf genres: [${result.join(', ')}]`);

    return result;
}
