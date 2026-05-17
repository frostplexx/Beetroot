#!/usr/bin/env node
/**
 * Test script for metadata comparison
 * Usage: npx tsx lib/importer/test.ts <filepath>
 */

import { getLocalTags } from './local_tags';
import { getAcoustidFingerprint, acoustIDLookup } from './acoustid';
import { getMusicBrainzData } from './musicbrainz';
import { compareMetadata } from './comparator';
import { formatDiff } from './diff_formatter';

async function test(filePath: string) {
    try {
        console.log('Fetching local tags...');
        const localTags = await getLocalTags(filePath);

        console.log('Generating audio fingerprint...');
        const fingerprint = await getAcoustidFingerprint(filePath);

        console.log('Looking up AcoustID...');
        const acoustID = await acoustIDLookup(fingerprint.fingerprint, fingerprint.duration);

        if (acoustID.status !== 'ok' || !acoustID.results?.length) {
            throw new Error('No AcoustID results found');
        }

        console.log('Fetching MusicBrainz data...');
        const mbData = await getMusicBrainzData(acoustID.results, filePath);

        console.log('Comparing metadata...\n');
        // Pass AcoustID score to help with recommendation
        const acoustIdScore = acoustID.results[0]?.score;
        const comparison = compareMetadata(localTags, mbData, acoustIdScore);

        // Output human-readable diff
        console.log(formatDiff(comparison, filePath));
    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
    console.error('Usage: npx tsx lib/importer/test.ts <filepath>');
    console.error('\nExample:');
    console.error('  npx tsx lib/importer/test.ts "/path/to/song.flac"');
    process.exit(1);
}

const filePath = args[0];

// Check if file exists
import { existsSync } from 'fs';
if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
}

// Run test
test(filePath).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
