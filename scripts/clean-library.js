#!/usr/bin/env bun

/**
 * Clean library script for debugging
 * Deletes database and optionally music files
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const args = process.argv.slice(2);
const shouldDeleteMusic = args.includes('--with-music');

// Load config
function loadConfig() {
    const configPath = process.env.CONFIG_PATH || 'config.yaml';
    if (!fs.existsSync(configPath)) {
        console.error('Config file not found at', configPath);
        process.exit(1);
    }
    const fileContents = fs.readFileSync(configPath, 'utf-8');
    return yaml.load(fileContents);
}

// Recursively delete directory
function deleteDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`✓ Deleted: ${dirPath}`);
        return true;
    }
    return false;
}

// Delete file
function deleteFile(filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`✓ Deleted: ${filePath}`);
        return true;
    }
    return false;
}

async function main() {
    console.log('🧹 Cleaning library...\n');

    const config = loadConfig();
    const projectRoot = process.cwd();

    // 1. Delete database
    const dbPath = path.resolve(projectRoot, config.database_path);
    if (deleteFile(dbPath)) {
        console.log('  Database removed');
    } else {
        console.log('  Database not found (already clean)');
    }

    // 2. Delete trash directory
    const trashDir = config.trash_directory
        ? config.trash_directory.replace('~', process.env.HOME)
        : path.join(config.music_directory.replace('~', process.env.HOME), '.trash');

    if (deleteDirectory(trashDir)) {
        console.log('  Trash directory removed');
    }

    // 3. Optionally delete music directory
    if (shouldDeleteMusic) {
        const musicDir = config.music_directory.replace('~', process.env.HOME);

        console.log(`\n⚠️  WARNING: About to delete music directory: ${musicDir}`);
        console.log('   This will DELETE ALL MUSIC FILES!');
        console.log('   Press Ctrl+C within 3 seconds to cancel...\n');

        // Wait 3 seconds
        await new Promise(resolve => setTimeout(resolve, 3000));

        if (deleteDirectory(musicDir)) {
            console.log('  Music directory removed');
        }
    }

    console.log('\n✨ Library cleaned successfully!');

    if (!shouldDeleteMusic) {
        console.log('\n💡 Tip: Use --with-music flag to also delete music files');
    }
}

main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});
