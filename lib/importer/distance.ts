/**
 * Distance-based metadata comparison inspired by beets
 * Uses weighted penalties to calculate similarity scores (0.0-1.0)
 */

export interface DistanceWeights {
    artist: number;
    album: number;
    title: number;
    trackTitle: number;
    trackLength: number;
    year: number;
    tracks: number;
    missingTracks: number;
    unmatchedTracks: number;
    musicbrainzId: number;
    [key: string]: number;
}

export const DEFAULT_WEIGHTS: DistanceWeights = {
    artist: 3.0,
    album: 3.0,
    title: 3.0,
    trackTitle: 3.0,
    trackLength: 2.0,
    year: 1.0,
    tracks: 2.0,
    missingTracks: 0.9,
    unmatchedTracks: 0.6,
    musicbrainzId: 5.0,
};

export type DistanceColor = 'strong' | 'medium' | 'weak' | 'none';

export enum Recommendation {
    None = 0,
    Low = 1,
    Medium = 2,
    Strong = 3,
}

/**
 * Distance object tracks weighted penalties for metadata comparison
 */
export class Distance {
    private _penalties: Map<string, number[]> = new Map();
    public tracks: Map<string, Distance> = new Map();

    constructor(private weights: DistanceWeights = DEFAULT_WEIGHTS) {}

    /**
     * Add a penalty for a specific field (0.0 = perfect match, 1.0 = complete mismatch)
     */
    add(key: string, penalty: number): void {
        if (!this._penalties.has(key)) {
            this._penalties.set(key, []);
        }
        this._penalties.get(key)!.push(Math.max(0, Math.min(1, penalty)));
    }

    /**
     * Add string distance penalty using Levenshtein with music-specific rules
     */
    addString(key: string, str1: string | null, str2: string | null): void {
        this.add(key, stringDistance(str1, str2));
    }

    /**
     * Add ratio-based penalty (e.g., year difference, duration difference)
     */
    addRatio(key: string, numerator: number, denominator: number): void {
        if (denominator === 0) {
            this.add(key, 0);
        } else {
            this.add(key, Math.abs(numerator) / denominator);
        }
    }

    /**
     * Add boolean expression penalty (0.0 if true, 1.0 if false)
     */
    addExpr(key: string, expression: boolean): void {
        this.add(key, expression ? 1.0 : 0.0);
    }

    /**
     * Get all penalty keys
     */
    keys(): string[] {
        return Array.from(this._penalties.keys());
    }

    /**
     * Get penalties for a specific key
     */
    getPenalties(key: string): number[] {
        return this._penalties.get(key) || [];
    }

    /**
     * Raw distance (unweighted sum)
     */
    get rawDistance(): number {
        let total = 0;
        for (const [key, penalties] of this._penalties.entries()) {
            const weight = this.weights[key] || 1.0;
            total += penalties.reduce((sum, p) => sum + p, 0) * weight;
        }
        return total;
    }

    /**
     * Maximum possible distance given current penalties
     */
    get maxDistance(): number {
        let total = 0;
        for (const [key, penalties] of this._penalties.entries()) {
            const weight = this.weights[key] || 1.0;
            total += penalties.length * weight;
        }
        return total;
    }

    /**
     * Normalized distance (0.0 = perfect, 1.0 = complete mismatch)
     */
    get distance(): number {
        return this.maxDistance > 0 ? this.rawDistance / this.maxDistance : 0.0;
    }

    /**
     * Get color code for UI display
     */
    get color(): DistanceColor {
        const d = this.distance;
        if (d < 0.04) return 'strong';
        if (d < 0.25) return 'medium';
        if (d < 0.5) return 'weak';
        return 'none';
    }

    /**
     * Get recommendation level
     */
    get recommendation(): Recommendation {
        const d = this.distance;
        if (d < 0.04) return Recommendation.Strong;
        if (d < 0.25) return Recommendation.Medium;
        if (d < 0.5) return Recommendation.Low;
        return Recommendation.None;
    }

    /**
     * Human-readable percentage string
     */
    get string(): string {
        const pct = Math.round((1 - this.distance) * 100);
        return `${pct}%`;
    }

    /**
     * Get summary of top penalties
     */
    getTopPenalties(limit: number = 5): Array<{ key: string; penalty: number; weight: number }> {
        const penalties: Array<{ key: string; penalty: number; weight: number }> = [];

        for (const [key, values] of this._penalties.entries()) {
            const weight = this.weights[key] || 1.0;
            const avgPenalty = values.reduce((sum, p) => sum + p, 0) / values.length;
            penalties.push({ key, penalty: avgPenalty, weight });
        }

        return penalties
            .sort((a, b) => b.penalty * b.weight - a.penalty * a.weight)
            .slice(0, limit);
    }
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshtein(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    if (len1 === 0) return len2;
    if (len2 === 0) return len1;

    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }

    return matrix[len1][len2];
}

/**
 * Weighted pattern matching for music metadata strings
 */
interface WeightedPart {
    text: string;
    weight: number;
}

function splitWeightedParts(str: string): WeightedPart[] {
    const parts: WeightedPart[] = [];
    let remaining = str;

    // Articles at the beginning (0.1 weight)
    const articleMatch = remaining.match(/^(the|a|an)\s+/i);
    if (articleMatch) {
        parts.push({ text: articleMatch[0], weight: 0.1 });
        remaining = remaining.slice(articleMatch[0].length);
    }

    // Parentheticals (0.3 weight for content, 0.0 for certain keywords)
    const parenRegex = /\([^)]*\)/g;
    let lastIndex = 0;
    let match;

    while ((match = parenRegex.exec(remaining)) !== null) {
        // Text before parenthetical (full weight)
        if (match.index > lastIndex) {
            parts.push({
                text: remaining.slice(lastIndex, match.index),
                weight: 1.0,
            });
        }

        // Parenthetical content
        const parenContent = match[0];
        if (/\b(ep|single|remaster|deluxe)\b/i.test(parenContent)) {
            parts.push({ text: parenContent, weight: 0.0 }); // Ignore
        } else {
            parts.push({ text: parenContent, weight: 0.3 });
        }

        lastIndex = parenRegex.lastIndex;
    }

    // Remaining text (full weight)
    if (lastIndex < remaining.length) {
        parts.push({ text: remaining.slice(lastIndex), weight: 1.0 });
    }

    // Featuring/feat./ft. (0.1 weight)
    for (const part of parts) {
        if (/\b(featuring|feat\.?|ft\.?)\b/i.test(part.text)) {
            part.weight = Math.min(part.weight, 0.1);
        }
    }

    return parts;
}

/**
 * Calculate string distance with music-specific rules (0.0 = identical, 1.0 = completely different)
 */
export function stringDistance(str1: string | null, str2: string | null): number {
    // Handle nulls
    if (str1 === null && str2 === null) return 0.0;
    if (str1 === null || str2 === null) return 1.0;

    // Normalize: lowercase, trim
    const norm1 = str1.toLowerCase().trim();
    const norm2 = str2.toLowerCase().trim();

    if (norm1 === norm2) return 0.0;
    if (norm1.length === 0 && norm2.length === 0) return 0.0;
    if (norm1.length === 0 || norm2.length === 0) return 1.0;

    // Split into weighted parts
    const parts1 = splitWeightedParts(norm1);
    const parts2 = splitWeightedParts(norm2);

    // Calculate weighted Levenshtein distance
    let totalDist = 0;
    let totalWeight = 0;

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] || { text: '', weight: 1.0 };
        const part2 = parts2[i] || { text: '', weight: 1.0 };

        const weight = (part1.weight + part2.weight) / 2;
        const maxLen = Math.max(part1.text.length, part2.text.length);

        if (maxLen > 0) {
            const dist = levenshtein(part1.text, part2.text) / maxLen;
            totalDist += dist * weight * maxLen;
            totalWeight += weight * maxLen;
        }
    }

    return totalWeight > 0 ? totalDist / totalWeight : 0.0;
}

/**
 * Calculate duration difference tolerance (in seconds)
 * Returns normalized penalty (0.0 = within tolerance, 1.0 = way off)
 */
export function durationDistance(dur1: number | null, dur2: number | null, maxDiff: number = 10): number {
    if (dur1 === null && dur2 === null) return 0.0;
    if (dur1 === null || dur2 === null) return 0.5; // Partial penalty for missing

    const diff = Math.abs(dur1 - dur2);
    return Math.min(diff / maxDiff, 1.0);
}

/**
 * Calculate year difference penalty
 */
export function yearDistance(year1: number | null, year2: number | null, maxDiff: number = 5): number {
    if (year1 === null && year2 === null) return 0.0;
    if (year1 === null || year2 === null) return 0.5;

    const diff = Math.abs(year1 - year2);
    return Math.min(diff / maxDiff, 1.0);
}
