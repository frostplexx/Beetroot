#!/usr/bin/env npx tsx

/**
 * Music Library Scanner & Importer
 *
 * Recursively scans the music directory and imports songs into the database
 *
 * Usage:
 *   npm run scan              # Import all new songs
 *   npm run scan -- --dry-run # Preview without importing
 *   npm run scan -- --force   # Re-import existing songs
 */

import { createSongBuilder } from '@/lib/importer/song-builder';
import { globalConfig } from '@/lib/config';
import db from '@/lib/music/database/db';
import * as fs from 'fs';
import * as path from 'path';

// Supported audio file extensions
const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.m4a', '.ogg', '.opus', '.wav', '.aac', '.wma'];

interface ScanOptions {
    dryRun: boolean;
    force: boolean;
    verbose: boolean;
    skipFingerprint: boolean;
}

interface ScanStats {
    total: number;
    imported: number;
    updated: number;
    skipped: number;
    failed: number;
}

/**
 * Recursively find all audio files in a directory
 */
function findAudioFiles(dir: string): string[] {
    const results: string[] = [];

    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                results.push(...findAudioFiles(fullPath));
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (AUDIO_EXTENSIONS.includes(ext)) {
                    results.push(fullPath);
                }
            }
        }
    } catch (error) {
        console.error(`Error reading directory ${dir}:`, error);
    }

    return results;
}

/**
 * Check if a song already exists in the database by path
 */
function songExists(filePath: string): number | null {
    try {
        const stmt = db.prepare('SELECT id FROM items WHERE path = ?');
        const result = stmt.get(filePath) as { id: number } | undefined;
        return result?.id ?? null;
    } catch (error) {
        console.error('Error checking if song exists:', error);
        return null;
    }
}

/**
 * Insert a new song into the database
 */
function insertSong(item: any): number {
    const fields = Object.keys(item).filter(k => item[k] !== undefined);
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(k => item[k]);

    const sql = `
        INSERT INTO items (${fields.join(', ')})
        VALUES (${placeholders})
    `;

    const stmt = db.prepare(sql);
    const result = stmt.run(...values);
    return result.lastInsertRowid as number;
}

/**
 * Update an existing song in the database
 */
function updateSong(id: number, item: any): void {
    const fields = Object.keys(item).filter(k => item[k] !== undefined && k !== 'id');
    const setClause = fields.map(k => `${k} = ?`).join(', ');
    const values = fields.map(k => item[k]);

    const sql = `UPDATE items SET ${setClause} WHERE id = ?`;

    const stmt = db.prepare(sql);
    stmt.run(...values, id);
}

/**
 * Format duration as MM:SS
 */
function formatDuration(seconds: number | null): string {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Process a single audio file
 */
async function processFile(
    filePath: string,
    options: ScanOptions,
    stats: ScanStats
): Promise<void> {
    const relPath = path.relative(
        globalConfig.music_directory.replace(/^~/, process.env.HOME || ''),
        filePath
    );

    // Check if already exists
    const existingId = songExists(filePath);
    if (existingId && !options.force) {
        if (options.verbose) {
            console.log(`  ⏭️  Already in database (ID: ${existingId})`);
        }
        stats.skipped++;
        return;
    }

    try {
        // Build metadata
        const builder = createSongBuilder(filePath);

        if (!options.verbose) {
            process.stdout.write('  ⏳ Fetching metadata...');
        }

        await builder.withLocalTags();

        if (!options.skipFingerprint) {
            await builder.withMusicBrainz();
            await builder.withGenres();
        }

        const item = builder.build();

        if (!options.verbose) {
            process.stdout.write(' ✓\n');
        }

        // Display info
        console.log(`  🎵 ${item.title || 'Unknown'} - ${item.artist || 'Unknown'}`);
        console.log(`  💿 ${item.album || 'Unknown'} ${item.year ? `(${item.year})` : ''}`);
        if (item.length) {
            console.log(`  ⏱️  ${formatDuration(item.length)}`);
        }
        if (item.genres) {
            console.log(`  🎸 ${item.genres}`);
        }

        // Import to database
        if (!options.dryRun) {
            if (existingId) {
                updateSong(existingId, item);
                console.log(`  ✅ Updated (ID: ${existingId})`);
                stats.updated++;
            } else {
                const newId = insertSong(item);
                console.log(`  ✅ Imported (ID: ${newId})`);
                stats.imported++;
            }
        } else {
            console.log(`  ℹ️  Would ${existingId ? 'update' : 'import'} (dry-run mode)`);
        }

    } catch (error) {
        if (!options.verbose) {
            process.stdout.write(' ✗\n');
        }
        console.error(`  ❌ Failed: ${error}`);
        stats.failed++;
    }
}

/**
 * Main scan function
 */
async function scan(options: ScanOptions): Promise<void> {
    console.log('🎵 Music Library Scanner');
    console.log('='.repeat(80));

    // Expand ~ to home directory
    let musicDir = globalConfig.music_directory;
    if (musicDir.startsWith('~')) {
        musicDir = path.join(process.env.HOME || '', musicDir.slice(1));
    }

    console.log(`📂 Music Directory: ${musicDir}`);
    console.log(`🔍 Mode: ${options.dryRun ? 'DRY RUN (preview only)' : 'IMPORT'}`);
    if (options.force) {
        console.log(`⚠️  Force mode: Will re-import existing songs`);
    }
    if (options.skipFingerprint) {
        console.log(`⚡ Fast mode: Skipping fingerprint/MusicBrainz`);
    }
    console.log('');

    if (!fs.existsSync(musicDir)) {
        console.error(`❌ Music directory does not exist: ${musicDir}`);
        process.exit(1);
    }

    console.log('🔍 Finding audio files...');
    const audioFiles = findAudioFiles(musicDir);
    console.log(`✓ Found ${audioFiles.length} audio files\n`);

    if (audioFiles.length === 0) {
        console.log('No audio files found');
        return;
    }

    const stats: ScanStats = {
        total: audioFiles.length,
        imported: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
    };

    const startTime = Date.now();

    for (let i = 0; i < audioFiles.length; i++) {
        const file = audioFiles[i];
        const relPath = path.relative(musicDir, file);

        console.log('');
        console.log(`[${i + 1}/${audioFiles.length}] ${relPath}`);

        await processFile(file, options, stats);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Summary
    console.log('');
    console.log('='.repeat(80));
    console.log('📊 Summary');
    console.log('─'.repeat(80));
    console.log(`📁 Total files:     ${stats.total}`);
    console.log(`✅ Imported:        ${stats.imported}`);
    console.log(`🔄 Updated:         ${stats.updated}`);
    console.log(`⏭️  Skipped:         ${stats.skipped}`);
    console.log(`❌ Failed:          ${stats.failed}`);
    console.log(`⏱️  Time:            ${elapsed}s`);
    console.log('='.repeat(80));

    if (options.dryRun) {
        console.log('');
        console.log('ℹ️  This was a dry-run. No changes were made to the database.');
        console.log('   Run without --dry-run to actually import songs.');
    }
}

/**
 * Parse command line arguments
 */
function parseArgs(): ScanOptions {
    const args = process.argv.slice(2);

    return {
        dryRun: args.includes('--dry-run') || args.includes('-d'),
        force: args.includes('--force') || args.includes('-f'),
        verbose: args.includes('--verbose') || args.includes('-v'),
        skipFingerprint: args.includes('--fast') || args.includes('--no-fingerprint'),
    };
}

/**
 * Show help text
 */
function showHelp(): void {
    console.log(`
Music Library Scanner & Importer

Usage:
  npm run scan [options]

Options:
  --dry-run, -d          Preview what would be imported without making changes
  --force, -f            Re-import existing songs (update metadata)
  --verbose, -v          Show detailed progress information
  --fast                 Skip fingerprinting (faster but less accurate)
  --no-fingerprint       Same as --fast
  --help, -h             Show this help message

Examples:
  npm run scan                    # Import new songs
  npm run scan -- --dry-run       # Preview without importing
  npm run scan -- --force         # Re-import all songs
  npm run scan -- --fast          # Quick import using local tags only

Notes:
  - Existing songs (same path) are skipped unless --force is used
  - Fingerprinting is slow but provides accurate MusicBrainz metadata
  - Use --fast for quick imports when you trust your local tags
  - MusicBrainz rate limit: 1 request/second (scanner handles automatically)
`);
}

// Main
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        showHelp();
        process.exit(0);
    }

    const options = parseArgs();

    scan(options)
        .then(() => {
            console.log('\n✓ Scan complete!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Scan failed:', error);
            process.exit(1);
        });
}

export { scan, parseArgs, findAudioFiles };
