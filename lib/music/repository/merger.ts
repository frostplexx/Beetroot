import { Item } from "../database";
import { SourceResult } from "./types";
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Debug flag for verbose merge logging
const DEBUG_MERGE = process.env.DEBUG_MERGE === 'true';

// Cache for genres tree - loaded once on first use
let genresTreeCache: any | null = null;
let parentMapCache: Map<string, Set<string>> | null = null;

function getGenresTree(): any {
    if (!genresTreeCache) {
        const genresTreePath = path.join(process.cwd(), 'lib/music/repository/genres-tree.yaml');
        genresTreeCache = yaml.load(fs.readFileSync(genresTreePath, 'utf8'));
    }
    return genresTreeCache;
}

function getParentMap(): Map<string, Set<string>> {
    if (!parentMapCache) {
        const genresTree = getGenresTree();
        parentMapCache = new Map<string, Set<string>>();

        function buildParentMap(node: any, parents: string[] = []) {
            if (node == null) {
                return;
            } else if (Array.isArray(node)) {
                for (const item of node) {
                    buildParentMap(item, parents);
                }
            } else if (typeof node === 'object') {
                for (const [key, value] of Object.entries(node)) {
                    const genre = key.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

                    if (!parentMapCache!.has(genre)) {
                        parentMapCache!.set(genre, new Set());
                    }
                    for (const parent of parents) {
                        parentMapCache!.get(genre)!.add(parent);
                    }

                    buildParentMap(value, [...parents, genre]);
                }
            } else if (typeof node === 'string') {
                const genre = node.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                if (!parentMapCache!.has(genre)) {
                    parentMapCache!.set(genre, new Set());
                }
                for (const parent of parents) {
                    parentMapCache!.get(genre)!.add(parent);
                }
            }
        }

        buildParentMap(genresTree);
    }
    return parentMapCache;
}


export function mergeData<T extends SourceResult>(items: T[]): T {
    // Filter out items with no data
    const validItems = items.filter(item => item.data != null);
    if (validItems.length === 0) return items[0];

    // Sort by confidence descending to get highest confidence source first
    validItems.sort((a, b) => b.confidence - a.confidence);

    // Create a fresh merged result without mutating the input
    // Note: merged.data cannot be null here since validItems is filtered to data != null
    const merged: T = {
        ...validItems[0],
        data: { ...validItems[0].data! }
    } as T;


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

        // Special handling for genres
        if (key === 'genres') {
            merged.data[key] = resolveGenres(validItems);
            continue;
        }

        // Collect all non-null values for this key with their sources
        const valuesWithSource = validItems
            .map(item => ({ value: item.data?.[key], confidence: item.confidence }))
            .filter(v => v.value != null);

        if (valuesWithSource.length === 0) continue;

        // If only one source has this field, use it
        if (valuesWithSource.length === 1) {
            merged.data[key] = valuesWithSource[0].value;
            continue;
        }

        // Determine the type of this field
        const firstValue = valuesWithSource[0].value;
        const valueType = Array.isArray(firstValue) ? 'array' : typeof firstValue;

        // Merge based on type
        if (valueType === 'number') {
            // Audio-only fields should always prefer LocalTagsSource (actual file data)
            const audioOnlyFields = ['length', 'bitrate', 'samplerate', 'bitdepth', 'channels'];
            if (audioOnlyFields.includes(key)) {
                // Find LocalTagsSource value
                const localTagsValue = validItems.find(s => s.sourceName === 'LocalTagsSource')?.data?.[key];
                if (localTagsValue != null) {
                    merged.data[key] = localTagsValue;
                } else {
                    // Fallback to max confidence if LocalTags doesn't have it
                    // validItems is already sorted by confidence descending, so just take first
                    merged.data[key] = valuesWithSource[0].value;
                }
            } else {
                // For other numbers: pick by max confidence
                // validItems is already sorted by confidence descending, so just take first
                merged.data[key] = valuesWithSource[0].value;
            }
        }
        } else if (valueType === 'boolean') {
            // For booleans: pick by max confidence
            // validItems is already sorted by confidence descending, so just take first
            merged.data[key] = valuesWithSource[0].value;
        } else if (valueType === 'array') {
            // Ordered arrays (credits) should preserve order from highest confidence source
            // Unordered arrays (genres, styles) can be unioned
            const orderedArrayFields = [
                'artists', 'artists_ids', 'albumartists', 'albumartists_ids',
                'composers', 'composers_ids', 'arrangers', 'arrangers_ids',
                'lyricists', 'lyricists_ids', 'remixers', 'remixers_ids'
            ];

            if (orderedArrayFields.includes(key)) {
                // For ordered arrays: pick the whole array from the highest confidence source
                // validItems is already sorted by confidence descending, so just take first
                merged.data[key] = valuesWithSource[0].value;
            } else {
                // For unordered arrays: union all values from sources with confidence >= 0.65
                const filteredValues = valuesWithSource.filter(v => v.confidence >= 0.65);
                const allArrayValues = filteredValues
                    .flatMap(v => Array.isArray(v.value) ? v.value : []);
                merged.data[key] = [...new Set(allArrayValues)];
            }
        } else if (valueType === 'string') {
            // For strings: use the existing conflict detection logic
            const stringValues = valuesWithSource
                .map(v => v.value as string)
                .filter(v => typeof v === 'string' && v.trim() !== '');

            if (stringValues.length === 0) continue;
            if (stringValues.length === 1) {
                merged.data[key] = stringValues[0];
                continue;
            }

            // Check if all values are identical
            const uniqueValues = new Set(stringValues);
            if (uniqueValues.size === 1) {
                merged.data[key] = stringValues[0];
                continue;
            }

            // For long text fields (lyrics, comments), skip Levenshtein (O(n·m) is too expensive)
            // and just pick by max confidence
            const isLongTextField = key === 'lyrics' || key === 'comments';
            const firstStringValue = stringValues[0];

            if (isLongTextField || firstStringValue.length > 500) {
                // Skip similarity check, pick by confidence
                // valuesWithSource is derived from validItems which is already sorted by confidence
                const firstNonEmpty = valuesWithSource.find(v =>
                    typeof v.value === 'string' && (v.value as string).trim() !== ''
                );
                if (firstNonEmpty) {
                    merged.data[key] = firstNonEmpty.value;
                }
                continue;
            }

            // Check similarity between values
            let hasConflict = false;
            for (let i = 1; i < stringValues.length; i++) {
                const distance = calculateLevenshteinDistance(firstStringValue, stringValues[i]);
                const maxLength = Math.max(firstStringValue.length, stringValues[i].length);
                const similarity = 1 - distance / maxLength;

                if (similarity <= 0.8) {
                    hasConflict = true;
                    if (DEBUG_MERGE) {
                        console.warn(`Merge conflict for key "${key}": "${firstStringValue}" vs "${stringValues[i]}" (similarity: ${similarity.toFixed(2)})`);
                    }
                    break;
                }
            }

            if (hasConflict) {
                conflictKeys.add(key);
            } else {
                // Similar enough, pick highest confidence
                // valuesWithSource is derived from validItems which is already sorted by confidence
                const firstNonEmpty = valuesWithSource.find(v =>
                    typeof v.value === 'string' && (v.value as string).trim() !== ''
                );
                if (firstNonEmpty) {
                    merged.data[key] = firstNonEmpty.value;
                }
            }
        } else {
            // For other types (objects, etc.), pick by max confidence
            // validItems is already sorted by confidence descending, so just take first
            merged.data[key] = valuesWithSource[0].value;
        }
    }

    // Second pass: resolve conflicts once for each conflicted key
    for (const key of conflictKeys) {
        merged.data[key] = resolveConflict(key, validItems);
    }

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

    // Debug logging removed - was generating excessive log volume (N·M per file)
    // Uncomment below if debugging merge conflicts:
    // const maxLen = Math.max(a.length, b.length);
    // const similarity = maxLen > 0 ? 1 - distance / maxLen : 1;
    // console.log(`[Levenshtein] "${a}" vs "${b}" -> distance: ${distance}, similarity: ${similarity.toFixed(2)}`);

    return distance;
}


function resolveConflict(key: string, sources: SourceResult[]): any {
    if (DEBUG_MERGE) {
        console.log(`[Conflict Resolution] Resolving conflict for key: "${key}"`);
    }

    // Check what each source says, normalized to lowercase, a trimmed and only alphanumeric
    // Pick the value that most sources agree on, then use the highest confidence source for the non-normalized return
    // If no value has majority agreement, use the value from the source with the highest confidence

    const normalizedValues: Record<string, { count: number, originalValues: any[], confidence: number[], sources: Array<{name: string, confidence: number}> }> = {};

    for (const source of sources) {
        const value = source.data?.[key];
        if (typeof value === 'string') {
            const normalized = value.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
            if (DEBUG_MERGE) {
                console.log(`  [${source.sourceName}] confidence: ${source.confidence}, value: "${value}", normalized: "${normalized}"`);
            }

            if (!normalizedValues[normalized]) {
                normalizedValues[normalized] = { count: 0, originalValues: [], confidence: [], sources: [] };
            }
            normalizedValues[normalized].count++;
            normalizedValues[normalized].originalValues.push(value);
            normalizedValues[normalized].confidence.push(source.confidence);
            normalizedValues[normalized].sources.push({ name: source.sourceName, confidence: source.confidence });
        }
    }

    if (DEBUG_MERGE) {
        console.log(`  Normalized value groups:`);
        for (const norm of Object.keys(normalizedValues)) {
            const group = normalizedValues[norm];
            console.log(`    "${norm}": ${group.count} sources`);
            group.sources.forEach((src, i) => {
                console.log(`      - ${src.name} (conf: ${src.confidence.toFixed(3)}): "${group.originalValues[i]}"`);
            });
        }
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

        if (DEBUG_MERGE) {
            console.log(`  [${normalized}] count: ${count}, avgConf: ${avgConfidence.toFixed(3)}, maxConf: ${maxConfidence.toFixed(3)}, boost: ${consensusBoost.toFixed(2)}, score: ${score.toFixed(3)}`);
        }

        if (score > bestScore) {
            bestScore = score;
            // Pick the highest confidence source from this group
            const index = confidence.indexOf(maxConfidence);
            bestValue = originalValues[index];
            bestInfo = { normalized, avgConfidence, count };
        }
    }

    if (bestValue !== null) {
        if (DEBUG_MERGE) {
            console.log(`  -> Winner: "${bestValue}" (normalized: "${bestInfo.normalized}", avgConf: ${bestInfo.avgConfidence.toFixed(3)}, sources: ${bestInfo.count})`);
        }
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
        if (DEBUG_MERGE) {
            console.log(`  -> Fallback: "${bestValue}" from ${maxSource} (confidence: ${maxConfidence})`);
        }
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
            if (DEBUG_MERGE) {
                console.log(`  [${source.sourceName}] genres: ${value.join(', ')}`);
            }
            genresWithSource.push(...value.map(g => ({ genre: g, confidence: source.confidence })));
            useAllSources = false;
        } else if (typeof value === 'string' && value.trim().length > 0) {
            if (DEBUG_MERGE) {
                console.log(`  [${source.sourceName}] genres: ${value}`);
            }
            genresWithSource.push(...(value as string).split(',').map(g => ({ genre: g.trim(), confidence: source.confidence })));
            useAllSources = false;
        }
    }

    // If Last.fm provided no genres, use all sources
    if (useAllSources) {
        if (DEBUG_MERGE) {
            console.log(`  Last.fm provided no genres, falling back to all sources`);
        }
        for (const source of sources) {
            const value = source.data?.genres;
            if (Array.isArray(value)) {
                if (DEBUG_MERGE) {
                    console.log(`  [${source.sourceName}] genres: ${value.join(', ')}`);
                }
                genresWithSource.push(...value.map(g => ({ genre: g, confidence: source.confidence })));
            } else if (typeof value === 'string') {
                if (DEBUG_MERGE) {
                    console.log(`  [${source.sourceName}] genres: ${value}`);
                }
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
    if (DEBUG_MERGE) {
        console.log(`  Collected ${normalizedGenres.length} unique genres: [${normalizedGenres.join(', ')}]`);
    }

    // Use cached genres tree and parent map
    const parentMap = getParentMap();

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

    if (DEBUG_MERGE && unknownGenres.length > 0) {
        console.log(`  Filtered out ${unknownGenres.length} unknown genres: [${unknownGenres.join(', ')}]`);
    }
    if (DEBUG_MERGE) {
        console.log(`  After expanding with parents: [${Array.from(allGenres).join(', ')}]`);
    }

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
    if (DEBUG_MERGE) {
        console.log(`  Final leaf genres: [${result.join(', ')}]`);
    }

    return result;
}
