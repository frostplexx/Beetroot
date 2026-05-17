# Placeholder Implementation Status

This document lists all placeholder implementations and what's needed to complete them.

## ✅ Fully Implemented (Production Ready)

These components are complete and functional:

- ✅ **Type definitions** (`types.ts`) - All interfaces defined
- ✅ **Database schema** - Source tracking, conflicts table, all columns
- ✅ **Source adapters** - File tags, MusicBrainz, Last.fm readers
- ✅ **Merger core logic** - Confidence-based merging, conflict detection
- ✅ **Sync logic** - Diff detection, conflict flagging and resolution
- ✅ **TrackRepository** - All CRUD operations, conflict management
- ✅ **Path generation** - Templates, bucket function, sanitization
- ✅ **File organization** - Folder creation, file moving
- ✅ **Configuration** - All settings defined and integrated
- ✅ **Tests** - Comprehensive test coverage

## ⚠️ Placeholder Implementations

### 1. Write-Back: Tag Writing to Files

**Status:** Placeholder - returns 'skipped' for all formats  
**Location:** `writeback.ts` lines 44-117

#### MP3 Tag Writing
```typescript
// Current: Placeholder
async function writeMp3Tags(filePath: string, track: TrackData)
// Returns: { status: 'skipped', reason: 'MP3 tag writing not yet implemented' }
```

**What's needed:**
- Install: `npm install node-id3`
- Add types: `npm install --save-dev @types/node-id3`
- Implement ID3v2.4 tag writing

**Example implementation:**
```typescript
import * as NodeID3 from 'node-id3';

const tags = {
    title: track.title,
    artist: track.artists?.join(', '),
    album: track.album,
    year: track.year?.toString(),
    trackNumber: track.trackNumber?.toString(),
    TRCK: `${track.trackNumber}/${track.trackTotal}`,
    partOfSet: `${track.discNumber}/${track.discTotal}`,
    genre: track.genres?.join(', '),
    ISRC: track.isrc,
    TXXX: {
        description: 'MusicBrainz Recording Id',
        value: track.musicbrainzId || ''
    }
};

const success = NodeID3.write(tags, filePath);
```

#### FLAC Tag Writing
```typescript
// Current: Placeholder
async function writeFlacTags(filePath: string, track: TrackData)
// Returns: { status: 'skipped', reason: 'FLAC tag writing not yet implemented' }
```

**What's needed:**
- Install: `npm install flac-metadata` (or similar FLAC library)
- Implement Vorbis comment writing

**Alternative:** Use `metaflac` command-line tool via child_process

#### M4A/MP4 Tag Writing
```typescript
// Current: Placeholder
async function writeM4aTags(filePath: string, track: TrackData)
// Returns: { status: 'skipped', reason: 'M4A tag writing not yet implemented' }
```

**What's needed:**
- Research: Find suitable npm package for M4A/AAC tag writing
- Options: `mp4-tags`, `atomicparsley` (CLI), or fork `music-metadata` for writing
- Implement iTunes-style tag writing

---

### 2. Genre Canonicalization

**Status:** Simplified - uses hardcoded whitelist  
**Location:** `merger.ts` lines 145-162

#### Genre Whitelist
```typescript
// Current: Hardcoded ~30 genres
function getGenreWhitelist(): Set<string>
```

**What's needed:**
```bash
# Download genre whitelist
curl -o lib/music/repository/data/genres.txt \
  https://raw.githubusercontent.com/beetbox/beets/master/beetsplug/lastgenre/genres.txt

# Load in code
const whitelist = fs.readFileSync('data/genres.txt', 'utf-8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => line.toLowerCase());
```

#### Genre Tree Canonicalization
```typescript
// Current: Not implemented
// TODO: Load and apply genres-tree.yaml for proper canonicalization
```

**What's needed:**
```bash
# Download genre tree
curl -o lib/music/repository/data/genres-tree.yaml \
  https://raw.githubusercontent.com/beetbox/beets/master/beetsplug/lastgenre/genres-tree.yaml

# Install YAML parser (already have js-yaml)
```

**Implementation:**
```typescript
import * as yaml from 'js-yaml';

type GenreTree = Record<string, string | GenreTree>;

function loadGenreTree(): GenreTree {
    const content = fs.readFileSync('data/genres-tree.yaml', 'utf-8');
    return yaml.load(content) as GenreTree;
}

function canonicalizeWithTree(genres: string[], tree: GenreTree): string[] {
    // Walk tree from leaves to root
    // Replace general genres with more specific ones
    // e.g., "rock" → "progressive rock" if both present
}
```

---

### 3. Album Art Extraction & Storage

**Status:** Not implemented  
**Mentioned in:** DESIGN.md lines 218-250

**What's needed:**

#### Extract from File
```typescript
// music-metadata already reads embedded art
import { parseFile } from 'music-metadata';

async function extractAlbumArt(filePath: string): Promise<AlbumArt | null> {
    const metadata = await parseFile(filePath);
    const picture = metadata.common.picture?.[0];
    
    if (!picture) return null;
    
    return {
        buffer: picture.data,
        mimeType: picture.format === 'image/jpeg' ? 'image/jpeg' : 'image/png',
        source: 'embedded'
    };
}
```

#### Fetch from Cover Art Archive
```typescript
async function fetchAlbumArtFromMB(releaseId: string): Promise<AlbumArt | null> {
    const url = `https://coverartarchive.org/release/${releaseId}/front`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    return {
        buffer: Buffer.from(await response.arrayBuffer()),
        mimeType: 'image/jpeg',
        source: 'coverartarchive'
    };
}
```

#### Save to Disk
```typescript
async function writeAlbumArt(albumFolder: string, art: AlbumArt): Promise<string> {
    const coverPath = path.join(albumFolder, 'cover.jpg');
    
    // Don't overwrite existing
    if (fs.existsSync(coverPath)) {
        return coverPath;
    }
    
    await fs.promises.writeFile(coverPath, art.buffer);
    return coverPath;
}
```

---

### 4. File Watching & Auto-Sync

**Status:** Not implemented  
**Mentioned in:** DESIGN.md lines 97-100

**What's needed:**
```bash
npm install chokidar
npm install --save-dev @types/chokidar
```

**Implementation:**
```typescript
import * as chokidar from 'chokidar';

class MusicLibraryWatcher {
    private watcher: chokidar.FSWatcher;
    
    constructor(
        private repository: TrackRepository,
        private musicDir: string
    ) {
        this.watcher = chokidar.watch(musicDir, {
            ignored: /(^|[\/\\])\../, // ignore dotfiles
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 2000, // Wait 2s for file to finish writing
                pollInterval: 100
            }
        });
        
        this.setupListeners();
    }
    
    private setupListeners() {
        this.watcher
            .on('add', (filePath) => this.handleFileAdded(filePath))
            .on('change', (filePath) => this.handleFileChanged(filePath))
            .on('unlink', (filePath) => this.handleFileDeleted(filePath));
    }
    
    private async handleFileAdded(filePath: string) {
        if (!this.isAudioFile(filePath)) return;
        await this.repository.importTrack(filePath);
    }
    
    private async handleFileChanged(filePath: string) {
        if (!this.isAudioFile(filePath)) return;
        const track = await this.repository.findTrackByPath(filePath);
        if (track) {
            await this.repository.syncTrackById(track.id);
        }
    }
    
    private handleFileDeleted(filePath: string) {
        const track = await this.repository.findTrackByPath(filePath);
        if (track) {
            this.repository.markMissing(track.id);
        }
    }
    
    private isAudioFile(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return ['.mp3', '.flac', '.m4a', '.mp4', '.ogg', '.opus'].includes(ext);
    }
}
```

---

### 5. Rate-Limited MusicBrainz Queue

**Status:** Not implemented  
**Mentioned in:** DESIGN.md lines 99-100

**What's needed:**
```bash
npm install p-queue
npm install --save-dev @types/p-queue
```

**Implementation:**
```typescript
import PQueue from 'p-queue';

class RateLimitedImporter {
    private queue: PQueue;
    
    constructor(private repository: TrackRepository) {
        // MusicBrainz allows 1 req/sec
        this.queue = new PQueue({
            intervalCap: 1,
            interval: 1000,
            carryoverConcurrencyCount: true
        });
    }
    
    async importTrack(filePath: string, options: ImportOptions) {
        return this.queue.add(() => 
            this.repository.importTrack(filePath, options)
        );
    }
    
    async importBatch(files: string[], options: ImportOptions) {
        const promises = files.map(file => this.importTrack(file, options));
        return Promise.allSettled(promises);
    }
}
```

---

### 6. Startup Full Scan

**Status:** Not implemented  
**Mentioned in:** DESIGN.md lines 91-100

**What's needed:**
```typescript
import { glob } from 'glob';

async function scanMusicLibrary(
    musicDir: string,
    repository: TrackRepository,
    rateLimiter: RateLimitedImporter
) {
    // Find all audio files
    const files = await glob('**/*.{mp3,flac,m4a,mp4,ogg,opus}', {
        cwd: musicDir,
        absolute: true,
        nodir: true
    });
    
    console.log(`Found ${files.length} audio files`);
    
    // Check which files are already in database
    const newFiles: string[] = [];
    const existingFiles: { id: number, path: string }[] = [];
    
    for (const file of files) {
        const track = repository.findTrackByPath(file);
        if (track) {
            existingFiles.push(track);
        } else {
            newFiles.push(file);
        }
    }
    
    console.log(`New files: ${newFiles.length}`);
    console.log(`Existing files: ${existingFiles.length}`);
    
    // Import new files with rate limiting
    console.log('Importing new files...');
    await rateLimiter.importBatch(newFiles, {
        skipMusicBrainz: false,
        skipLastFm: false,
        writeBack: 'never',
        conflictResolution: 'keep-db'
    });
    
    // Sync existing files (check for changes)
    console.log('Syncing existing files...');
    for (const { id, path } of existingFiles) {
        const result = await repository.syncTrackById(id);
        if (result.status === 'conflict') {
            console.log(`Conflicts in ${path}:`, result.conflicts);
        }
    }
}
```

---

## Summary

### To Complete Immediately (High Priority)

1. **Tag Writing** - Download/install node-id3, flac-metadata
2. **Genre Data** - Download genres.txt and genres-tree.yaml

### To Complete Soon (Medium Priority)

3. **Album Art** - Implement extraction and storage
4. **File Watcher** - Install chokidar, implement auto-sync

### To Complete Later (Low Priority)

5. **Rate Limiting** - Install p-queue, wrap imports
6. **Full Scan** - Implement startup scan logic

### Installation Commands

```bash
# High priority
npm install node-id3 flac-metadata

# Medium priority  
npm install chokidar

# Low priority
npm install p-queue glob

# Type definitions
npm install --save-dev @types/node-id3 @types/chokidar @types/p-queue
```

### Download Genre Data

```bash
mkdir -p lib/music/repository/data
cd lib/music/repository/data

curl -O https://raw.githubusercontent.com/beetbox/beets/master/beetsplug/lastgenre/genres.txt
curl -O https://raw.githubusercontent.com/beetbox/beets/master/beetsplug/lastgenre/genres-tree.yaml
```

---

## Current Functionality

**Everything works except:**
- Writing tags back to files (returns 'skipped')
- Genre tree canonicalization (uses simple filtering)
- Album art handling
- Automatic file watching
- Rate-limited batch imports

**You can use the repository now for:**
- ✅ Reading and importing tracks
- ✅ Merging metadata from multiple sources
- ✅ Detecting and resolving conflicts
- ✅ Syncing database with file changes
- ✅ Managing missing files
- ✅ Generating proper folder paths
