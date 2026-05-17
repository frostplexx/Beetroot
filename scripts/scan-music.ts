#!/usr/bin/env npx tsx

/**
 * Scan music directory and display metadata for all songs
 *
 * Usage:
 *   npm run scan-music
 *   or
 *   npx tsx scripts/scan-music.ts
 */

import { scanMusicDirectory } from '../lib/importer/song-builder.test';

scanMusicDirectory()
    .then(() => {
        console.log('\n✓ Scan complete!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Scan failed:', error);
        process.exit(1);
    });
