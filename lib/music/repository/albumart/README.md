# Album Art Fetching

Multi-source album art fetching with automatic fallback and quality selection.

## Features

- **Multiple Sources**: Embedded, MusicBrainz, iTunes, Spotify
- **Automatic Fallback**: Tries sources in priority order until suitable art found
- **Quality Filtering**: Minimum dimension requirements
- **Smart Matching**: Normalizes artist/album names for better results
- **Automatic Saving**: Saves to `cover.jpg` in album folder
- **No Overwrites**: Respects existing cover art

## Sources

### 1. Embedded (from file tags)
- **Priority**: First (fastest, already have the file)
- **Quality**: Varies (depends on what was embedded)
- **Requirements**: None
- **Pros**: Instant, no network calls
- **Cons**: May be low quality or missing

### 2. MusicBrainz Cover Art Archive
- **Priority**: Second (high quality, authoritative)
- **Quality**: High (usually 500px+)
- **Requirements**: MusicBrainz release ID
- **Pros**: High quality, official releases
- **Cons**: Not all releases have art

### 3. iTunes API
- **Priority**: Third (good quality, fast)
- **Quality**: High (up to 1200x1200px)
- **Requirements**: Artist + Album name
- **Pros**: Fast, no auth required, high quality
- **Cons**: May not match obscure releases

### 4. Spotify API
- **Priority**: Fourth (excellent quality)
- **Quality**: Very High (up to 640x640px or higher)
- **Requirements**: Artist + Album name + Spotify credentials
- **Pros**: Excellent quality, good coverage
- **Cons**: Requires OAuth setup

## Usage

### Basic Usage

```typescript
import { albumArtManager } from '@/lib/music/repository/albumart';

// Fetch album art
const art = await albumArtManager.fetchAlbumArt({
    filePath: '/music/Artist/Album/track.mp3',
    releaseId: 'mb-release-id',
    artist: 'Artist Name',
    album: 'Album Name'
});

if (art) {
    console.log(`Found ${art.width}x${art.height} from ${art.source}`);
}
```

### With Quality Requirements

```typescript
const art = await albumArtManager.fetchAlbumArt(
    {
        filePath: '/music/track.mp3',
        artist: 'Artist',
        album: 'Album'
    },
    {
        minWidth: 500,
        minHeight: 500,
        preferredSources: ['itunes', 'spotify', 'embedded']
    }
);
```

### Fetch and Save

```typescript
import { getAndSaveAlbumArt } from '@/lib/music/repository/albumart';

// Fetch and save in one call
const coverPath = await getAndSaveAlbumArt(
    '/music/Artist/Album/track.mp3',
    'mb-release-id',
    'Artist',
    'Album'
);

console.log(`Saved to: ${coverPath}`); // /music/Artist/Album/cover.jpg
```

### From Repository

```typescript
import { TrackRepository } from '@/lib/music/repository';

const repo = new TrackRepository(db);

// Album art is automatically fetched during import
const { trackId } = await repo.importTrack('/music/track.mp3');

// Or fetch manually for existing track
const coverPath = await repo.fetchAlbumArtForTrack(trackId);
```

## Configuration

### Spotify Setup (Optional)

To enable Spotify album art:

1. Create a Spotify app at https://developer.spotify.com/dashboard
2. Get your Client ID and Client Secret
3. Add to `config.yaml`:

```yaml
spotify_client_id: your_client_id
spotify_client_secret: your_client_secret
```

Or set environment variables:
```bash
export SPOTIFY_CLIENT_ID=your_client_id
export SPOTIFY_CLIENT_SECRET=your_client_secret
```

### Source Priority

Default priority:
1. Embedded (from file)
2. Cover Art Archive (MusicBrainz)
3. iTunes
4. Spotify

Custom priority:
```typescript
{
    preferredSources: ['spotify', 'itunes', 'coverartarchive', 'embedded']
}
```

### Quality Settings

```typescript
{
    minWidth: 500,   // Minimum width in pixels
    minHeight: 500   // Minimum height in pixels
}
```

## API Reference

### AlbumArtManager

```typescript
class AlbumArtManager {
    // Fetch from multiple sources with fallback
    async fetchAlbumArt(
        context: FetchContext,
        options?: AlbumArtOptions
    ): Promise<AlbumArt | null>

    // Save to disk
    async saveAlbumArt(
        art: AlbumArt,
        albumFolder: string
    ): Promise<string>

    // Fetch and save in one call
    async fetchAndSave(
        context: FetchContext,
        albumFolder: string,
        options?: AlbumArtOptions
    ): Promise<string | null>
}
```

### Types

```typescript
interface FetchContext {
    filePath?: string;      // For embedded extraction
    releaseId?: string;     // For MusicBrainz
    artist?: string;        // For iTunes/Spotify
    album?: string;         // For iTunes/Spotify
}

interface AlbumArtOptions {
    preferredSources?: AlbumArtSource[];
    minWidth?: number;
    minHeight?: number;
    saveToFile?: boolean;
}

interface AlbumArt {
    buffer: Buffer;
    mimeType: 'image/jpeg' | 'image/png';
    source: 'embedded' | 'coverartarchive' | 'itunes' | 'spotify';
    quality?: 'high' | 'medium' | 'low';
    width?: number;
    height?: number;
    url?: string;
}
```

## How It Works

### Fallback Logic

1. Try each source in priority order
2. Check if result meets quality requirements
3. If quality insufficient, try next source
4. Return first suitable result or null

### Smart Matching

Artist/album names are normalized for better matching:
- Lowercase conversion
- Special character removal
- Whitespace normalization
- Exact match preferred, partial match fallback

### Dimension Detection

- JPEG: Parses SOF markers
- PNG: Reads IHDR chunk
- Used for quality assessment

### Spotify Token Caching

- Tokens cached for ~1 hour
- Automatic refresh on expiry
- Thread-safe singleton

## Examples

### Example 1: Import with Album Art

```typescript
const { trackId } = await repository.importTrack('/music/track.mp3', {
    skipMusicBrainz: false,
    skipLastFm: false
});

// Album art automatically fetched and saved
```

### Example 2: Fetch for Existing Tracks

```typescript
// Batch fetch album art for library
const tracks = db.prepare('SELECT id FROM items WHERE artpath IS NULL').all();

for (const { id } of tracks) {
    try {
        const path = await repository.fetchAlbumArtForTrack(id);
        console.log(`✓ Fetched art for track ${id}: ${path}`);
    } catch (error) {
        console.log(`✗ Failed for track ${id}`);
    }
}
```

### Example 3: Custom Source Priority

```typescript
// Prefer online sources over embedded
const art = await albumArtManager.fetchAlbumArt(
    {
        filePath: '/music/track.mp3',
        releaseId: 'mb-id',
        artist: 'Artist',
        album: 'Album'
    },
    {
        preferredSources: ['coverartarchive', 'spotify', 'itunes', 'embedded'],
        minWidth: 600,
        minHeight: 600
    }
);
```

## Troubleshooting

### No Album Art Found

Reasons:
- All sources returned no results
- Results didn't meet quality requirements
- Network issues
- Missing credentials (Spotify)

Solutions:
- Check artist/album spelling
- Lower quality requirements
- Add Spotify credentials
- Try different source priority

### Low Quality Results

- Embedded art is low quality
- No high-res sources available

Solutions:
- Increase `minWidth`/`minHeight`
- Prefer online sources over embedded
- Check if better release on MusicBrainz

### Spotify Not Working

- Missing credentials
- Invalid credentials
- Token expired

Solutions:
- Check `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`
- Verify credentials at Spotify Developer Dashboard
- Clear token cache: `clearSpotifyTokenCache()`

## Performance

- **Embedded**: Instant (already read with metadata)
- **MusicBrainz**: ~200-500ms
- **iTunes**: ~100-300ms
- **Spotify**: ~300-600ms (includes token fetch)

First call with Spotify adds ~500ms for token acquisition, then cached.

## Rate Limits

- **MusicBrainz**: 1 req/sec (enforced in musicbrainz.ts)
- **iTunes**: No official limit (be reasonable)
- **Spotify**: 180 req/30sec (generous, unlikely to hit)

## Error Handling

All sources fail gracefully:
- Network errors → null
- No match → null
- Invalid credentials → null (with debug log)

Album art fetch never aborts track import.
