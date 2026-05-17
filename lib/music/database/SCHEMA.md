# Beets Database Schema

This project implements the same SQLite schema as [beets](https://github.com/beetbox/beets), the music library management system.

## Tables

### `albums`
Stores album-level metadata (43 columns):
- **Core fields**: id, album, albumartist, year, added
- **MusicBrainz IDs**: mb_albumid, mb_albumartistid, mb_releasegroupid
- **Audio metadata**: genres, label, country, language, catalognum, barcode
- **ReplayGain**: rg_album_gain, rg_album_peak, r128_album_gain
- **Release info**: albumstatus, albumtype, albumtypes, day, month, original_year
- **Discogs IDs**: discogs_albumid, discogs_artistid, discogs_labelid
- **Cover art**: artpath (BLOB)

### `items`
Stores track-level metadata (97 columns):
- **Core fields**: id, title, artist, album, album_id, track, path, length
- **MusicBrainz IDs**: mb_trackid, mb_releasetrackid, mb_artistid, mb_workid
- **Audio format**: format, bitrate, bitdepth, samplerate, channels
- **ReplayGain**: rg_track_gain, rg_track_peak, r128_track_gain
- **Tags**: lyrics, comments, bpm, initial_key, isrc
- **Encoding**: encoder, encoder_info, encoder_settings, bitrate_mode
- **Credits**: composers, arrangers, lyricists, remixers (with IDs)
- **Acoustid**: acoustid_id, acoustid_fingerprint
- Inherits many album fields for denormalized queries

### `album_attributes`
Flexible key-value storage for custom album fields:
- id, entity_id, key, value
- Allows plugins and custom metadata without schema changes

### `item_attributes`
Flexible key-value storage for custom track fields:
- id, entity_id, key, value
- Same flexibility as album_attributes

### `migrations`
Tracks database schema migrations:
- name, table_name

## Indices

### Albums
- `album_album`: Fast album name lookups
- `album_albumartist`: Fast artist lookups
- `album_added`: Sorting by date added
- `album_mb_albumid`: MusicBrainz integration

### Items
- `idx_item_album_id`: Join with albums table
- `item_title`, `item_artist`, `item_album`, `item_albumartist`: Search optimization
- `item_path`: File path lookups
- `item_mb_trackid`: MusicBrainz integration

### Flexible attributes
- `album_attributes_by_entity`: Fast attribute lookups
- `item_attributes_by_entity`: Fast attribute lookups

## Data Types

Following beets conventions:
- **INTEGER**: Numbers, booleans (0/1), IDs
- **REAL**: Floats, timestamps, durations, ReplayGain values
- **TEXT**: Strings, delimited multi-values ("; " or "\\␀")
- **BLOB**: File paths (stored as bytes)

## Multi-Value Fields

Fields ending in 's' often store multiple values as delimited strings:
- `artists`, `albumartists`, `genres`: "; " or "\\␀" delimiter
- Parse with `.split('; ')` or `.split('\\␀')`

## Foreign Keys

- `items.album_id` → `albums.id` (ON DELETE SET NULL)
- `album_attributes.entity_id` → `albums.id` (ON DELETE CASCADE)
- `item_attributes.entity_id` → `items.id` (ON DELETE CASCADE)

## Initialization

The database is automatically created on first import of `lib/music/database/db`:
```typescript
import db from '@/lib/music/database/db'
```

The schema is created if:
1. The database file doesn't exist
2. Required tables are missing

## Compatibility

This schema is compatible with beets-created databases, allowing you to:
- Read existing beets libraries
- Share a database between beets CLI and this application
- Use beets plugins that rely on the standard schema

## References

- [Beets documentation](https://beets.readthedocs.io/)
- [Beets source code](https://github.com/beetbox/beets)
- Schema defined in: `beets/library/fields.py`, `beets/library/models.py`, `beets/dbcore/db.py`
