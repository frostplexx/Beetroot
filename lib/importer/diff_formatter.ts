/**
 * Human-readable diff formatter with color-coded changes (beets-style)
 */

import { ComparisonResult } from './comparator';
import { Recommendation } from './distance';

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    bold: '\x1b[1m',
};

function colorize(color: keyof typeof colors, text: string): string {
    return `${colors[color]}${text}${colors.reset}`;
}

/**
 * Calculate character-level diff between two strings
 */
interface DiffPart {
    type: 'equal' | 'insert' | 'delete';
    text: string;
}

function characterDiff(str1: string, str2: string): { left: DiffPart[]; right: DiffPart[] } {
    // Simple character-by-character diff
    const len1 = str1.length;
    const len2 = str2.length;
    const maxLen = Math.max(len1, len2);

    const left: DiffPart[] = [];
    const right: DiffPart[] = [];

    let i = 0;
    let j = 0;

    while (i < len1 || j < len2) {
        if (i < len1 && j < len2 && str1[i] === str2[j]) {
            // Characters match
            left.push({ type: 'equal', text: str1[i] });
            right.push({ type: 'equal', text: str2[j] });
            i++;
            j++;
        } else if (i < len1 && j < len2) {
            // Characters differ - mark as changed
            left.push({ type: 'delete', text: str1[i] });
            right.push({ type: 'insert', text: str2[j] });
            i++;
            j++;
        } else if (i < len1) {
            // Extra in str1 (will be deleted)
            left.push({ type: 'delete', text: str1[i] });
            i++;
        } else {
            // Extra in str2 (will be added)
            right.push({ type: 'insert', text: str2[j] });
            j++;
        }
    }

    return { left, right };
}

/**
 * Format diff parts with colors
 */
function formatDiffParts(parts: DiffPart[]): string {
    return parts
        .map(part => {
            if (part.type === 'delete') {
                return colorize('red', part.text);
            } else if (part.type === 'insert') {
                return colorize('green', part.text);
            } else {
                return part.text;
            }
        })
        .join('');
}

/**
 * Check if two strings are similar enough to show character diff
 * (if too different, just show them side by side)
 */
function shouldShowCharDiff(str1: string, str2: string): boolean {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return false;

    // Use simple character matching ratio
    let matches = 0;
    for (let i = 0; i < Math.min(str1.length, str2.length); i++) {
        if (str1[i].toLowerCase() === str2[i].toLowerCase()) matches++;
    }

    return matches / maxLen > 0.5; // At least 50% similar
}

/**
 * Format a single field change
 */
function formatFieldChange(
    field: string,
    localValue: any,
    mbValue: any,
    penalty: number
): string {
    const localStr = localValue === null ? colorize('gray', '(none)') : String(localValue);
    const mbStr = mbValue === null ? colorize('gray', '(none)') : String(mbValue);

    // Skip if both are null or identical
    if (localValue === mbValue) return '';
    if (localValue === null && mbValue === null) return '';

    let output = '';

    // Field name with penalty indicator
    const penaltyPct = Math.round(penalty * 100);
    let icon = '  ';
    if (penalty === 0) {
        icon = colorize('green', '✓ ');
    } else if (penalty < 0.3) {
        icon = colorize('yellow', '~ ');
    } else {
        icon = colorize('red', '✗ ');
    }

    output += `${icon}${colorize('bold', field)}`;
    if (penalty > 0) {
        output += colorize('gray', ` (${penaltyPct}% diff)`);
    }
    output += ':\n';

    // Show character-level diff for strings if they're similar
    if (
        typeof localValue === 'string' &&
        typeof mbValue === 'string' &&
        shouldShowCharDiff(localValue, mbValue)
    ) {
        const diff = characterDiff(localValue, mbValue);
        output += `    ${colorize('gray', 'Current:  ')}${formatDiffParts(diff.left)}\n`;
        output += `    ${colorize('gray', 'Update:   ')}${formatDiffParts(diff.right)}\n`;
    } else {
        // Just show side by side
        output += `    ${colorize('red', '- ')}${localStr}\n`;
        output += `    ${colorize('green', '+ ')}${mbStr}\n`;
    }

    return output;
}

/**
 * Format the full comparison result as a human-readable diff
 */
export function formatDiff(result: ComparisonResult, filePath: string): string {
    let output = '';

    // Header
    output += '\n';
    output += colorize('bold', '═'.repeat(70)) + '\n';
    output += colorize('bold', `File: ${filePath}`) + '\n';
    output += colorize('bold', '═'.repeat(70)) + '\n';
    output += '\n';

    // Match quality indicator
    const matchPct = result.distance.string;
    let matchColor: keyof typeof colors = 'green';
    let recText = '';

    switch (result.recommendation) {
        case Recommendation.Strong:
            matchColor = 'green';
            recText = 'STRONG MATCH';
            break;
        case Recommendation.Medium:
            matchColor = 'yellow';
            recText = 'MEDIUM MATCH';
            break;
        case Recommendation.Low:
            matchColor = 'red';
            recText = 'WEAK MATCH';
            break;
        default:
            matchColor = 'red';
            recText = 'NO MATCH';
    }

    output += colorize(matchColor, `${recText} (${matchPct})`) + '\n';
    output += colorize('gray', `Distance: ${result.distance.distance.toFixed(3)}`) + '\n';

    // Show if recommendation was boosted by fingerprint
    const acoustIdScore = result.notCompared.musicbrainz.find(f => f.field === 'acoustIdScore')?.value;
    if (acoustIdScore && acoustIdScore > 0.95) {
        output += colorize('cyan', `AcoustID Confidence: ${(acoustIdScore * 100).toFixed(2)}% (high confidence boost)`) + '\n';
    }

    output += '\n';

    // Top issues
    const topPenalties = result.distance.getTopPenalties(3);
    if (topPenalties.some(p => p.penalty > 0.1)) {
        output += colorize('bold', 'Top Issues:') + '\n';
        for (const p of topPenalties) {
            if (p.penalty > 0.1) {
                output += colorize('yellow', `  • ${p.key}: ${(p.penalty * 100).toFixed(0)}% penalty\n`);
            }
        }
        output += '\n';
    }

    // Changes section
    const changes = result.fields.filter(f => f.penalty > 0 || f.localValue !== f.musicbrainzValue);

    if (changes.length > 0) {
        output += colorize('bold', 'Proposed Changes:') + '\n';
        output += colorize('gray', '─'.repeat(70)) + '\n';
        output += '\n';

        for (const field of changes) {
            const formatted = formatFieldChange(
                field.field,
                field.localValue,
                field.musicbrainzValue,
                field.penalty
            );
            if (formatted) {
                output += formatted + '\n';
            }
        }
    }

    // No changes section
    const noChanges = result.fields.filter(f => f.penalty === 0 && f.localValue === f.musicbrainzValue);
    if (noChanges.length > 0) {
        output += colorize('bold', 'Already Correct:') + '\n';
        output += colorize('gray', '─'.repeat(70)) + '\n';
        for (const field of noChanges) {
            output += colorize('green', `  ✓ ${field.field}: `) + colorize('gray', String(field.localValue)) + '\n';
        }
        output += '\n';
    }

    // Local metadata (not in MusicBrainz)
    if (result.notCompared.local.length > 0) {
        output += colorize('bold', 'Local Metadata (preserved):') + '\n';
        output += colorize('gray', '─'.repeat(70)) + '\n';
        for (const item of result.notCompared.local) {
            const valueStr = Array.isArray(item.value)
                ? item.value.join(', ')
                : String(item.value);
            output += colorize('blue', `  • ${item.field}: `) + colorize('gray', valueStr) + '\n';
        }
        output += '\n';
    }

    // Additional MusicBrainz info
    if (result.notCompared.musicbrainz.length > 0) {
        output += colorize('bold', 'Additional MusicBrainz Info:') + '\n';
        output += colorize('gray', '─'.repeat(70)) + '\n';
        for (const item of result.notCompared.musicbrainz.slice(0, 5)) {
            output += colorize('cyan', `  ℹ ${item.field}: `) + String(item.value) + '\n';
        }
        output += '\n';
    }

    // Footer with recommendation
    output += colorize('bold', '─'.repeat(70)) + '\n';
    switch (result.recommendation) {
        case Recommendation.Strong:
            output += colorize('green', '✓ Safe to apply automatically') + '\n';
            break;
        case Recommendation.Medium:
            output += colorize('yellow', '⚠ Review recommended before applying') + '\n';
            break;
        case Recommendation.Low:
            output += colorize('red', '⚠ Manual review required - significant differences') + '\n';
            break;
        default:
            output += colorize('red', '✗ Do not apply - metadata does not match') + '\n';
    }
    output += colorize('bold', '═'.repeat(70)) + '\n';
    output += '\n';

    return output;
}

/**
 * Format multiple comparison results (for batch imports)
 */
export function formatBatchDiff(results: Array<{ filePath: string; comparison: ComparisonResult }>): string {
    let output = '';

    // Summary header
    output += '\n';
    output += colorize('bold', '═'.repeat(70)) + '\n';
    output += colorize('bold', `BATCH IMPORT PREVIEW (${results.length} files)`) + '\n';
    output += colorize('bold', '═'.repeat(70)) + '\n';
    output += '\n';

    // Summary by recommendation
    const byRec = {
        strong: results.filter(r => r.comparison.recommendation === Recommendation.Strong).length,
        medium: results.filter(r => r.comparison.recommendation === Recommendation.Medium).length,
        low: results.filter(r => r.comparison.recommendation === Recommendation.Low).length,
        none: results.filter(r => r.comparison.recommendation === Recommendation.None).length,
    };

    output += colorize('green', `  ✓ Strong matches: ${byRec.strong}`) + '\n';
    output += colorize('yellow', `  ~ Medium matches: ${byRec.medium}`) + '\n';
    output += colorize('red', `  ✗ Weak matches: ${byRec.low}`) + '\n';
    if (byRec.none > 0) {
        output += colorize('red', `  ✗ No matches: ${byRec.none}`) + '\n';
    }
    output += '\n';

    // Individual diffs
    for (const result of results) {
        output += formatDiff(result.comparison, result.filePath);
    }

    return output;
}
