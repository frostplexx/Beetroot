# Music Repository Pattern

This implements a repository pattern for managing music metadata with conflict resolution and multi-source merging.

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Song Tags  │    │ MusicBrainz  │    │   Last.fm   │
│  (source)   │    │   (source)   │    │   (source)  │
└──────┬──────┘    └──────┬───────┘    └──────┬──────┘
       └─────────────────┬┘                   │
                  ┌──────▼──────┐             │
                  │   Merger    │◄────────────┘
                  │  (resolve   │
                  │  conflicts) │
                  └──────┬──────┘
                  ┌──────▼──────┐
                  │  Repository │
                  │  (sqlite)   │
                  └─────────────┘
                         │
             ┌───────────▼───────────┐
             │     Write-back        │
             │  (syncs DB → file)    │
             └───────────┬───────────┘
                         │
             ┌───────────▼───────────┐
             │     File System       │
             │  (tags on disk)       │
             └───────────────────────┘
```

## Key Features

- **Multi-source merging**: Combines metadata from file tags, MusicBrainz, and Last.fm
- **Confidence-based resolution**: Higher confidence sources take precedence
- **Conflict detection**: Flags when user edits differ from file changes
- **Source tracking**: Records which source provided each field value
- **Genre canonicalization**: Filters and normalizes genre tags
- **Write-back support**: Optionally syncs database changes back to files
- **Missing file tracking**: Tracks when files disappear without deleting metadata

## Usage

### Basic Import

```typescript
import { TrackRepository } from '@/lib/music/repository';
import db from '@/lib/music/database/db';

const repository = new TrackRepository(db);

// Import a track
const { trackId, conflicts } = await repository.importTrack('/music/song.mp3', {
    skipMusicBrainz: false,
    skipLastFm: false,
    writeBack: 'never',
    conflictResolution: 'keep-db'
});

console.log(`Imported track ${trackId} with ${conflicts.length} conflicts`);
```

### Sync Existing Track

```typescript
// Sync track with file (detect if file was modified)
const result = await repository.syncTrackById(trackId);

if (result.status === 'conflict') {
    console.log('Conflicts detected:', result.conflicts);
}
```

### Resolve Conflicts

```typescript
// Get all conflicts for a track
const conflicts = repository.getConflicts(trackId);

for (const conflict of conflicts) {
    console.log(`Field ${conflict.field}:`);
    console.log(`  DB: ${conflict.dbValue} (${conflict.dbSource})`);
    console.log(`  File: ${conflict.fileValue}`);
}

// Resolve conflict
repository.resolveConflict(conflicts[0].id, 'file'); // or 'db', 'mb', 'custom'
```

### Mark Missing Files

```typescript
// Mark track as missing when file is deleted
repository.markMissing(trackId);
```

## Configuration

Add to `config.yaml`:

```yaml
# Conflict resolution strategy
conflict_resolution: keep-db  # keep-db | keep-file | keep-mb | manual

# Write-back mode
writeback_mode: never  # always | never | missing-only

# Path templates (beets-compatible)
paths:
  comp: Compilations/$album/$track $title
  default: '%bucket{$albumartist,alpha}/$albumartist/$album/$track $title'
  singleton: '%bucket{$artist,alpha}/$artist/$album/$title'
```

## Database Schema

### Source Tracking

Each field has a corresponding `_source` column:

```sql
CREATE TABLE items (
    -- ... fields ...
    title TEXT,
    title_source TEXT,  -- 'tags' | 'musicbrainz' | 'lastfm' | 'database' | 'user'
    -- ...
);
```

### Conflict Tracking

```sql
CREATE TABLE sync_conflicts (
    id INTEGER PRIMARY KEY,
    track_id INTEGER NOT NULL,
    field TEXT NOT NULL,
    db_value TEXT,
    db_source TEXT,
    file_value TEXT,
    mb_value TEXT,
    timestamp REAL NOT NULL
);
```

## Merger Logic

The merger combines data from multiple sources:

1. **Confidence-based**: Higher confidence sources win
2. **Special cases**:
   - Duration prefers file tags over MusicBrainz
   - Genres are merged and canonicalized
3. **Conflict detection**: Compares new values against database
4. **Resolution strategies**: Configurable conflict resolution

## Testing

Run tests:

```bash
npm test
```

Test files:
- `__tests__/merger.test.ts` - Merger logic and conflict resolution
- `__tests__/sync.test.ts` - Sync and conflict detection
- `__tests__/repository.test.ts` - Repository operations
- `__tests__/writeback.test.ts` - Path generation and write-back

## TODO

- [ ] Download and parse genre whitelist from beets
- [ ] Download and parse genre canonicalization tree
- [ ] Implement actual tag writing (node-id3, flac-tagger)
- [ ] Add album art extraction and storage
- [ ] Add file watcher with chokidar
- [ ] Add rate-limited MusicBrainz queue with p-queue
- [ ] Implement full startup scan logic

## File Structure

```
lib/music/repository/
├── index.ts              # TrackRepository class (main API)
├── types.ts              # TypeScript interfaces
├── merger.ts             # Field-level merge logic
├── sync.ts               # Diff and conflict detection
├── writeback.ts          # Tag writing and path generation
├── sources/
│   ├── tags.ts          # File tag reader
│   ├── musicbrainz.ts   # MusicBrainz adapter
│   ├── lastfm.ts        # Last.fm adapter
│   └── index.ts         # Source exports
└── __tests__/
    ├── merger.test.ts
    ├── sync.test.ts
    ├── repository.test.ts
    └── writeback.test.ts
```
