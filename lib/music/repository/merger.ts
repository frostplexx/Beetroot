import { Item } from "../database";
import { SourceResult } from "./types";


export function mergeData<T extends SourceResult>(items: T[]): T {
    // Filter out items with no data
    const validItems = items.filter(item => item.data != null);
    if (validItems.length === 0) return items[0];

    // Start with the highest confidence source
    let merged: T = validItems[0];

    // Collect all unique keys across all sources
    const allKeys = new Set<string>();
    for (const item of validItems) {
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

        // Collect all non-null string values for this key
        const values = validItems
            .map(item => item.data[key])
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
}
