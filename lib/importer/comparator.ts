import { LocalTags } from './local_tags';
import { Recording } from './musicbrainz';
import {
    Distance,
    DEFAULT_WEIGHTS,
    Recommendation,
    stringDistance,
    durationDistance,
    yearDistance,
} from './distance';

export interface MetadataDiff {
    field: string;
    localValue: any;
    musicbrainzValue: any;
    penalty: number;
    weight: number;
    note?: string;
}

export interface ComparisonResult {
    distance: Distance;
    recommendation: Recommendation;
    fields: MetadataDiff[];
    notCompared: {
        local: Array<{ field: string; value: any; note?: string }>;
        musicbrainz: Array<{ field: string; value: any; note?: string }>;
    };
}

/**
 * Normalize year from MusicBrainz date string
 */
function normalizeYear(dateString?: string): number | null {
    if (!dateString) return null;
    const year = parseInt(dateString.split('-')[0]);
    return isNaN(year) ? null : year;
}

/**
 * Normalize duration to seconds
 */
function normalizeDuration(duration: number | null, isMilliseconds: boolean): number | null {
    if (duration === null) return null;
    return isMilliseconds ? Math.round(duration / 1000) : duration;
}

/**
 * Compare LocalTags and MusicBrainz Recording data using distance-based scoring
 */
export function compareMetadata(
    local: LocalTags,
    musicbrainz: Recording,
    acoustIdScore?: number
): ComparisonResult {
    const distance = new Distance(DEFAULT_WEIGHTS);
    const fields: MetadataDiff[] = [];

    // Apply AcoustID confidence boost to recommendation
    // High fingerprint confidence (>0.95) means the audio matches even if tags don't
    const fingerprintBoost = acoustIdScore && acoustIdScore > 0.95;

    // Title comparison
    const titleDist = stringDistance(local.title, musicbrainz.title);
    distance.addString('title', local.title, musicbrainz.title);
    fields.push({
        field: 'title',
        localValue: local.title,
        musicbrainzValue: musicbrainz.title,
        penalty: titleDist,
        weight: DEFAULT_WEIGHTS.title,
        note: titleDist < 0.1 ? 'Strong match' : titleDist < 0.3 ? 'Similar' : 'Different',
    });

    // Artist comparison (join arrays for comparison)
    const localArtist = local.artist || (local.artists ? local.artists.join(', ') : null);
    const mbArtist = musicbrainz.artists.join(', ');
    const artistDist = stringDistance(localArtist, mbArtist);
    distance.addString('artist', localArtist, mbArtist);
    fields.push({
        field: 'artist',
        localValue: localArtist,
        musicbrainzValue: mbArtist,
        penalty: artistDist,
        weight: DEFAULT_WEIGHTS.artist,
        note: artistDist < 0.1 ? 'Strong match' : artistDist < 0.3 ? 'Similar' : 'Different',
    });

    // Album comparison
    const albumDist = stringDistance(local.album, musicbrainz.releaseTitle);
    distance.addString('album', local.album, musicbrainz.releaseTitle);
    fields.push({
        field: 'album',
        localValue: local.album,
        musicbrainzValue: musicbrainz.releaseTitle,
        penalty: albumDist,
        weight: DEFAULT_WEIGHTS.album,
        note: albumDist < 0.1 ? 'Strong match' : albumDist < 0.3 ? 'Similar' : 'Different',
    });

    // Year comparison
    const mbYear = normalizeYear(musicbrainz.releaseDate);
    const yearDist = yearDistance(local.year, mbYear);
    distance.add('year', yearDist);
    fields.push({
        field: 'year',
        localValue: local.year,
        musicbrainzValue: mbYear,
        penalty: yearDist,
        weight: DEFAULT_WEIGHTS.year,
        note: `Difference: ${local.year && mbYear ? Math.abs(local.year - mbYear) : 'N/A'} years`,
    });

    // Duration comparison
    const localDur = normalizeDuration(local.duration, false);
    const mbDur = normalizeDuration(musicbrainz.duration || null, true);
    const durDist = durationDistance(localDur, mbDur, 10);
    distance.add('trackLength', durDist);
    fields.push({
        field: 'duration',
        localValue: localDur ? `${Math.round(localDur)}s` : null,
        musicbrainzValue: mbDur ? `${Math.round(mbDur)}s` : null,
        penalty: durDist,
        weight: DEFAULT_WEIGHTS.trackLength,
        note: localDur && mbDur ? `Difference: ${Math.abs(localDur - mbDur).toFixed(1)}s` : 'Missing data',
    });

    // MusicBrainz ID comparison (exact match check)
    const hasLocalMbId = !!local.musicbrainzRecordingId;
    const idsMatch = local.musicbrainzRecordingId === musicbrainz.musicbrainzId;
    distance.addExpr('musicbrainzId', hasLocalMbId && !idsMatch);
    fields.push({
        field: 'musicbrainzRecordingId',
        localValue: local.musicbrainzRecordingId,
        musicbrainzValue: musicbrainz.musicbrainzId,
        penalty: idsMatch ? 0.0 : hasLocalMbId ? 1.0 : 0.5,
        weight: DEFAULT_WEIGHTS.musicbrainzId,
        note: idsMatch
            ? 'IDs match'
            : hasLocalMbId
            ? 'Conflict: IDs differ'
            : 'Local file missing ID',
    });

    // Fields not compared (exist in one source but not fetched/available in the other)
    const notCompared = {
        local: [
            { field: 'track', value: local.track, note: 'Track sequencing info from file' },
            { field: 'disc', value: local.disc, note: 'Disc sequencing info from file' },
            { field: 'albumArtist', value: local.albumArtist, note: 'Album-level artist from file' },
            { field: 'genre', value: local.genre, note: 'Genre tags from file (MusicBrainz has genres but not fetched)' },
            { field: 'composer', value: local.composer, note: 'Composer from file tags (MusicBrainz has via works/relationships but not fetched)' },
            { field: 'bitrate', value: local.bitrate, note: 'Audio encoding property' },
            { field: 'sampleRate', value: local.sampleRate, note: 'Audio encoding property' },
            { field: 'codec', value: local.codec, note: 'Audio encoding property' },
            { field: 'lossless', value: local.lossless, note: 'Audio encoding property' },
            { field: 'hasArtwork', value: local.hasArtwork, note: 'Cover art embedded in file' },
        ].filter(item => item.value !== null),
        musicbrainz: [
            { field: 'disambiguation', value: musicbrainz.disambiguation, note: 'Disambiguation comment from MusicBrainz' },
            { field: 'releaseCountry', value: musicbrainz.releaseCountry, note: 'Release country code' },
            { field: 'releaseStatus', value: musicbrainz.releaseStatus, note: 'Release status (Official, Bootleg, etc.)' },
            { field: 'acoustIdId', value: musicbrainz.acoustIdId, note: 'AcoustID fingerprint match ID' },
            { field: 'acoustIdScore', value: musicbrainz.acoustIdScore, note: 'AcoustID match confidence score' },
            { field: 'artistIds', value: musicbrainz.artistIds, note: 'MusicBrainz artist IDs' },
        ].filter(item => item.value !== undefined && item.value !== null),
    };

    // Override recommendation if AcoustID score is very high
    let finalRecommendation = distance.recommendation;

    if (fingerprintBoost && acoustIdScore) {
        // Very high AcoustID score - trust the fingerprint over tag similarity
        if (acoustIdScore > 0.99) {
            // Extremely confident (>99%) - always recommend
            finalRecommendation = Recommendation.Strong;
        } else if (acoustIdScore > 0.95 && distance.distance < 0.9) {
            // High confidence (>95%) and not completely different - upgrade recommendation
            finalRecommendation = Math.max(finalRecommendation, Recommendation.Medium) as Recommendation;
        }
    }

    return {
        distance,
        recommendation: finalRecommendation,
        fields,
        notCompared,
    };
}

/**
 * Format comparison result as a readable string
 */
export function formatComparisonResult(result: ComparisonResult): string {
    let output = '';

    output += '='.repeat(60) + '\n';
    output += 'METADATA COMPARISON RESULT\n';
    output += '='.repeat(60) + '\n\n';

    // Overall similarity
    output += `Match Quality: ${result.distance.string} (${result.distance.color})\n`;
    output += `Recommendation: ${Recommendation[result.recommendation]}\n`;
    output += `Distance Score: ${result.distance.distance.toFixed(3)}\n\n`;

    // Top penalties
    const topPenalties = result.distance.getTopPenalties(3);
    if (topPenalties.length > 0) {
        output += 'Top Issues:\n';
        for (const p of topPenalties) {
            output += `  • ${p.key}: ${(p.penalty * 100).toFixed(1)}% penalty (weight: ${p.weight})\n`;
        }
        output += '\n';
    }

    // Field-by-field comparison
    output += `FIELD COMPARISON:\n`;
    output += '-'.repeat(60) + '\n';
    for (const field of result.fields) {
        const icon = field.penalty < 0.1 ? '✓' : field.penalty < 0.5 ? '⚠' : '✗';
        output += `${icon} ${field.field} (penalty: ${(field.penalty * 100).toFixed(1)}%):\n`;
        output += `    Local:       ${JSON.stringify(field.localValue)}\n`;
        output += `    MusicBrainz: ${JSON.stringify(field.musicbrainzValue)}\n`;
        if (field.note) {
            output += `    ${field.note}\n`;
        }
        output += '\n';
    }

    // Not compared - local fields
    if (result.notCompared.local.length > 0) {
        output += `ℹ NOT COMPARED - LOCAL FIELDS (${result.notCompared.local.length}):\n`;
        output += '-'.repeat(60) + '\n';
        for (const item of result.notCompared.local) {
            output += `  ${item.field}: ${JSON.stringify(item.value)}\n`;
            if (item.note) {
                output += `    ${item.note}\n`;
            }
        }
        output += '\n';
    }

    // Not compared - MusicBrainz fields
    if (result.notCompared.musicbrainz.length > 0) {
        output += `ℹ NOT COMPARED - MUSICBRAINZ FIELDS (${result.notCompared.musicbrainz.length}):\n`;
        output += '-'.repeat(60) + '\n';
        for (const item of result.notCompared.musicbrainz) {
            output += `  ${item.field}: ${JSON.stringify(item.value)}\n`;
            if (item.note) {
                output += `    ${item.note}\n`;
            }
        }
        output += '\n';
    }

    output += '='.repeat(60) + '\n';

    return output;
}

/**
 * Get recommended action based on comparison
 */
export function getRecommendedAction(result: ComparisonResult): string {
    const rec = result.recommendation;

    if (rec === Recommendation.Strong) {
        return 'STRONG MATCH: Safe to apply MusicBrainz metadata automatically.';
    } else if (rec === Recommendation.Medium) {
        return 'MEDIUM MATCH: Review changes before applying.';
    } else if (rec === Recommendation.Low) {
        return 'WEAK MATCH: Manual review recommended - significant differences detected.';
    } else {
        return 'NO MATCH: Do not apply - metadata does not match.';
    }
}
