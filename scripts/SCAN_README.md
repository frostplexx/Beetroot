# Music Library Scanner

Import your music collection into the Beetroot database with complete metadata.

## Quick Start

```bash
# Preview what will be imported (dry-run)
npm run scan -- --dry-run

# Import all new songs
npm run scan

# Re-import everything with updated metadata
npm run scan -- --force
```

## Features

✅ **Recursive scanning** - Finds all audio files in your music directory  
✅ **Smart deduplication** - Skips songs already in database  
✅ **Complete metadata** - Local tags + MusicBrainz + Last.fm genres  
✅ **Rate limiting** - Respects MusicBrainz API limits  
✅ **Error resilient** - Continues on failures  
✅ **Progress tracking** - Shows detailed import progress  
✅ **Dry-run mode** - Preview before importing  

## Usage

### Basic Import

```bash
npm run scan
```

Scans your music directory and imports all new songs.

### Preview Mode (Dry-Run)

```bash
npm run scan -- --dry-run
```

Shows what would be imported without making any database changes.

### Force Re-import

```bash
npm run scan -- --force
```

Re-imports all songs, updating metadata for existing ones.

### Fast Mode (No Fingerprinting)

```bash
npm run scan -- --fast
```

Uses only local tags, skipping fingerprinting and MusicBrainz lookup. Much faster but less accurate.

### Verbose Mode

```bash
npm run scan -- --verbose
```

Shows detailed progress information during scanning.

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--dry-run` | `-d` | Preview without importing |
| `--force` | `-f` | Re-import existing songs |
| `--verbose` | `-v` | Show detailed progress |
| `--fast` | | Skip fingerprinting (local tags only) |
| `--help` | `-h` | Show help message |

## Output

### During Scan

```
[5/69] path/to/song.flac
  ⏳ Fetching metadata... ✓
  🎵 Beautiful Day - U2
  💿 All That You Can't Leave Behind (2000)
  ⏱️  4:08
  🎸 rock; alternative rock
  ✅ Imported (ID: 42)
```

### Summary

```
📊 Summary
────────────────────────────────────────────────────────────────────────────────
📁 Total files:     69
✅ Imported:        50
🔄 Updated:         0
⏭️  Skipped:         15
❌ Failed:          4
⏱️  Time:            892.3s
```

## How It Works

1. **Find Files** - Recursively scans music directory for audio files
2. **Check Database** - Skips songs already imported (unless `--force`)
3. **Build Metadata** - For each song:
   - Read local tags from file
   - Generate AcoustID fingerprint
   - Lookup on MusicBrainz
   - Fetch genres from Last.fm
4. **Import** - Save to database
5. **Report** - Show summary statistics

## Performance

### Standard Mode

- **Local tags**: ~100ms per song
- **Fingerprinting**: ~5-10s per song
- **MusicBrainz**: ~2-3s per song (rate limited to 1 req/sec)
- **Genres**: ~1s per song

**Total**: ~10-15 seconds per song

For 100 songs: **~15-25 minutes**

### Fast Mode (`--fast`)

- **Local tags only**: ~100ms per song

For 100 songs: **~10 seconds**

## Supported Formats

- MP3 (`.mp3`)
- FLAC (`.flac`)
- AAC/M4A (`.m4a`, `.aac`)
- OGG Vorbis (`.ogg`)
- Opus (`.opus`)
- WAV (`.wav`)
- WMA (`.wma`)

## Common Scenarios

### First Import

```bash
# Preview first
npm run scan -- --dry-run

# If looks good, import
npm run scan
```

### Quick Import (Local Tags Only)

```bash
npm run scan -- --fast
```

Good when:
- Your files already have accurate tags
- You want speed over MusicBrainz accuracy
- You'll clean up metadata later

### Refresh Metadata

```bash
npm run scan -- --force
```

Updates all songs with fresh MusicBrainz/Last.fm data.

### Import Just One Album

Currently scans all files. To import specific directories, temporarily change `music_directory` in `config.yaml`.

## Troubleshooting

### "Music directory does not exist"

Update `music_directory` in `config.yaml`:

```yaml
music_directory: ~/Music/BeetsTest
```

### Rate Limiting Errors

The scanner automatically handles MusicBrainz rate limits (1 req/sec). If you see rate limit errors:

- ✓ Scanner will retry automatically with backoff
- ✓ Just let it run, it will recover
- ℹ️ Use `--fast` to skip MusicBrainz entirely

### "Audio format not supported by fpcalc"

Some audio codecs aren't supported by the fingerprinting tool. The scanner will:
- ✓ Show a warning
- ✓ Skip fingerprinting for that file
- ✓ Import using local tags only
- ✓ Continue with remaining files

Common unsupported formats:
- Some AAC variants in `.m4a` containers
- Protected/DRM files
- Unusual codecs

### Failed Imports

Songs that fail to import are listed in the summary. Common causes:
- Corrupt audio files
- Missing required metadata (title/artist)
- Permission issues

Check the error messages and fix the source files.

## Database Schema

Songs are imported to the `items` table with fields:
- Basic: `title`, `artist`, `album`, `track`, `year`
- Audio: `format`, `bitrate`, `samplerate`, `channels`, `length`
- MusicBrainz: `mb_trackid`, `mb_albumid`, `mb_artistid`
- AcoustID: `acoustid_id`, `acoustid_fingerprint`
- Genres: `genres`
- File: `path`, `added`
- And 70+ more fields from the beets schema

## Comparison: scan.ts vs scan-music.ts

| Feature | `scan.ts` | `scan-music.ts` |
|---------|-----------|-----------------|
| Purpose | Import to database | Display only |
| Database writes | ✓ | ✗ |
| Dry-run mode | ✓ | ✗ |
| Force re-import | ✓ | ✗ |
| Fast mode | ✓ | ✗ |
| Deduplication | ✓ | ✗ |
| Use case | Production import | Testing/preview |

## Next Steps

After importing:

1. **View in UI** - Start the dev server: `npm run dev`
2. **Query database** - Use SQL or the database API
3. **Refresh metadata** - Run `npm run scan -- --force`
4. **Add more songs** - Add files and run `npm run scan` again

## See Also

- [SONG_BUILDER.md](../lib/importer/SONG_BUILDER.md) - Builder pattern API
- [SCANNER.md](../lib/importer/SCANNER.md) - Display-only scanner
- [config.yaml](../config.yaml) - Configuration file
