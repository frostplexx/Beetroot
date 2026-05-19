## Overview

Use a repository pattern for merging, conflict resolution and writing back to disk:


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


### Sources Layer

Each source returns a partial Track with a confidence score.

```typescript
interface TrackData {
    title?: string;
    artists?: string[];
    album?: string;
    year?: number;
    genres?: string[];
    duration?: number;
    musicbrainzId?: string;
    acoustIdScore?: number;
    // ... etc
}

interface ScoredTrackData {
    data: TrackData;
    confidence: number;   // 0-1
    source: 'tags' | 'musicbrainz' | 'database';
}
```

Sources that don't match the track data need an Adapter Pattern to adapt them to TrackData


### Merger

Merge field level data based on confidence scores.
Conflict resolution -> allow setting in config.yaml, have following settings: `'keep-db' | 'keep-file' | 'keep-mb' | 'manual';`

- Genres are merged by canonicality i.e. Rock gets replaced by Metal gets replaced by Death Metal
- Genres are filtered using the following white list:
https://raw.githubusercontent.com/beetbox/beets/master/beetsplug/lastgenre/genres.txt (one genre per line)
- Coninzation through https://raw.githubusercontent.com/beetbox/beets/master/beetsplug/lastgenre/genres-tree.yaml yaml
    - This works using a tree of nested genre names, represented using YAML, where the leaves of the tree represent the most specific genres.
tree of canonicality
- Duration should be preferred the actual audio length of the recording instead of music brainz
- Fields should be normalized i.e. all lower case for comparison but then the case that is written should be the one
from the source

```ts
interface SyncConflict {
    field: keyof TrackData;
    dbValue: unknown;
    fileValue: unknown;
    mbValue?: unknown;
}
```

### Repository

Source of truth. Central sqlite database. merger results get written into this

Sync strategy:

- startup       -> for each file, check if its in DB, if it isn't run importTrack, if it is, diff db vs tags and check if they match
- file added    -> importTrack (tags + MB lookup)
- file changed  -> syncTrack (diff db vs new tags, flag conflicts)
- file deleted  -> mark as missing, don't delete (user may re-add)
- db edited     -> write tags back to file (optional, user-controlled)

— use chokidar as file watcher
- Debounce a second or two on rapid file changes
- On startup, scan files in parallel but if they need musicbrainz data they should get added to a queue for rate
limiting reasons use `p-queue`


**Key principle:** database is the working copy, files are the source of truth for existence, MusicBrainz fills gaps.
User edits go to DB first, then optionally written back to file tags.

There are some tags that can't/aren't stored in the database. these should skip the repository layer and should be
straight passed through to the write back layer e.g. lyrics, cover_path.


## Write Back Layer

Use the following libraries: music-metadata node-id3 flac-tagger.

Write back layers job is it to prevent file data and database data from drifting. It writes
back the data diffs which got updated from the DB into the files tags.

When write back fails abort the import of this one file.

Write back layer should also handle creating the folder tree e.g. `A-D/Bad Bunny/DeBÍ TiRAR MáS FOToS`

Needs to be configurable in config using dsl e.g. 
paths:
  comp: Compilations/$album/$track $title
  default: '%bucket{$albumartist,alpha}/$albumartist/$album/$track $title'
  singleton: '%bucket{$artist,alpha}/$artist/$album/$title'

-> Same as beets config but with bucket plugin built in


# Code Spec


Folder setup: 

```
lib/
  repository/
    index.ts          # TrackRepository class (main entry point)
    merger.ts         # Field-level merge logic
    sync.ts           # Diff + conflict detection
    writeback.ts      # File tag writing (MP3, FLAC, M4A)
    sources/
      tags.ts         # music-metadata reader
      musicbrainz.ts  # existing getMusicBrainzData wrapper
      lastfm.ts       # existing fetchGenres wrapper
  importer/
    acoustid.ts       # existing
    musicbrainz.ts    # existing
    lastfm.ts         # existing
```

## Data typesNo source column per field — needed to know if a value was user-edited vs MB vs tags (critical for conflict resolution)

No missing_since column mentioned in schema (you noted it in key decisions but didn't add it)
sync_conflicts table not defined in schema section

```ts
type WriteBackMode = 'always' | 'never' | 'missing-only';
type DataSource = 'tags' | 'musicbrainz' | 'database';
type SyncStatus = 'ok' | 'updated' | 'conflict' | 'missing';

interface TrackData {
    title?: string;
    artists?: string[];
    album?: string;
    album_artist: string
    date?: Date;
    year?: number;
    totaldiscs:	number;
    totaltracks:	number;
    tracknumber:	number;
    tracktotal:	number;
    genres?: string[];
    duration?: number;
    label: string;
    trackNo?: number;
    discNo?: number;
    compilation: boolean;
    musicbrainzId?: string;
    lyrics: string[];
    acoustId?: string;
    acoustIdScore?: number;
    releaseId?: string;
    releaseTitle?: string;
    releaseCountry?: string;
    releaseStatus?: string;
    filePath: string;
    isrc: string;
    //...
}

interface ScoredTrackData {
    data: TrackData;
    confidence: number; // 0-1
    source: DataSource;
}

interface SyncConflict {
    field: keyof TrackData;
    dbValue: unknown;
    fileValue: unknown;
    mbValue?: unknown;
}

interface SyncResult {
    status: SyncStatus;
    conflicts?: SyncConflict[];
    updated?: Partial<TrackData>;
}

interface WriteBackResult {
    status: 'ok' | 'skipped' | 'error';
    reason?: string;
    error?: Error;
}
```

## Album Art

Source:
  - Extracted from existing file tags (music-metadata can read embedded art)
  - Fetched from MusicBrainz Cover Art Archive and others (TODO)
    https://coverartarchive.org/release/<releaseId>/front

Storage:
  - Written to disk only, never stored in SQLite
  - Path: <albumFolder>/cover.jpg
  - If cover.jpg already exists, skip unless 'always' write-back mode
  - DB stores only the path: cover_path TEXT

Flow:
  importTrack(filePath)
    └── fetchAlbumArt(releaseId)         → Buffer | null
          ├── try: extract from file tags
          └── fallback: GET coverartarchive.org/release/<id>/front
    └── writeAlbumArt(albumFolder, buffer)
          └── writes <albumFolder>/cover.jpg
          └── updates tracks SET cover_path = ? WHERE album = ?  (all tracks in album share it)

Write-back:
  - Album art is always pass-through — never goes through merger or conflict resolution
  - If cover.jpg exists → skip (don't overwrite user's existing art)
  - If write fails → log warning, do NOT abort import (unlike other write-back failures)

Interface:
  interface AlbumArt {
    buffer: Buffer;
    mimeType: 'image/jpeg' | 'image/png';
    source: 'embedded' | 'coverartarchive';
  }

## Database schema

Expand beets database schema with: 

- source column per field so we know the source for conflict resolution
- missing_since if a file disappears
- sync_conflicts table


## Import flow

```
importTrack(filePath)
  ├── readLocalTags(filePath)          → ScoredTrackData (confidence: 0.5)
  ├── getAcoustidFingerprint(filePath)
  │     └── acoustIDLookup()
  │           └── getMusicBrainzData() → ScoredTrackData (confidence: 0.8)
  │                 └── fetchGenres()  → appended to mb genres
  ├── mergeTrackData([tags, mb])       → TrackData
  ├── db.upsert(track)
  └── maybeWriteBack(filePath, originalTags, merged)
```

## Conflict resolution flow

```
conflict flagged
  → stored in sync_conflicts table
  → surfaced in UI as "needs review"
  → user picks: keep-db / keep-file / keep-mb / manual entry
  → resolveConflict(id, resolution) updates track + clears conflict
  → if resolution writes to file → writeTagsToFile()
```


## Other

- file_hash uses MD5 of first 128KB only (fast, sufficient for change detection)
- artists and genres stored as JSON arrays in SQLite, not normalized tables (simpler, sufficient)
- Never hard-delete tracks from DB when file is missing — add missing_since timestamp column instead
- Write-back mode is a setting, expose in config.yaml 
- Rate limit MusicBrainz calls to 1 req/sec during syncAll() using a queue


## Error Handling

- When musicbrainz or acoustid are down, ask user if they want to continue and only use file tags as source
    - Will hopefully be resolved on next scan because some database entries are missing
- If database is down, abort and show in UI
