# Beetroot Project Handoff

## Project Overview

Beetroot is a modern web-based frontend for managing a [beets](https://beets.io/) music library. It provides a clean, minimal interface for browsing albums, searching tracks, managing metadata, and previewing music.

**Tech Stack:**
- **Frontend**: React 18 + Vite, Tailwind CSS v4, React Router, Font Awesome 6
- **Backend**: Go 1.x with SQLite (via modernc.org/sqlite), direct beets CLI integration
- **Database**: Read-only access to beets SQLite database for queries, write operations via beets CLI

## Design Guidelines

### Color Palette

**Primary Colors:**
- **Accent**: Rose (`rose-500`, `rose-400`, etc.) - used for interactive elements, hover states, active tabs
- **Background**: Neutral-950 (dark) with gradient overlays on album pages
- **Text**: Neutral-100 (primary), Neutral-400 (secondary), Neutral-500 (tertiary)
- **Borders**: Neutral-800, Neutral-900

**IMPORTANT**: The original design used emerald/green, but was changed to rose/red to match the beetroot theme. Never use emerald colors.

### Typography & Spacing

- **Font**: System font stack (default)
- **Icons**: Font Awesome 6.5.1 (loaded via CDN in index.html)
- **NEVER use emojis in code or UI** unless explicitly requested
- Use Font Awesome icons for all UI elements

### Layout Patterns

1. **Header**: Sticky at top (top-0), full width, opaque background (bg-neutral-950), z-50
2. **Content**: Max-width container (max-w-7xl) with px-6 py-8 padding
3. **Minimal Design**: No unnecessary gradients, clean borders, subtle hover effects
4. **Scrollbar Gutter**: Keep layout stable with `scrollbar-gutter: stable` in index.css

### Interactive States

- **Hover**: Border changes to rose-500, text to rose-400/500
- **Active Tab**: bg-rose-500/10 with rose-500 text
- **Buttons**: Neutral-800 bg with neutral-700 border, hover to rose-500 border
- **Transitions**: Use `transition-colors` or `transition-all duration-300` for smooth changes

## Architecture

### Frontend Structure

```
frontend/
├── src/
│   ├── App.jsx          # Main app with all components (single file architecture)
│   ├── main.jsx         # Entry point
│   ├── index.css        # Global styles (Tailwind import, animations)
│   └── App.css          # Component styles (minimal)
├── index.html           # Font Awesome CDN link
└── vite.config.js       # Vite configuration
```

**Single File Architecture**: All React components are in App.jsx (Dashboard, AlbumDetail, Header, PreviewPanel, etc.). This is intentional and should be maintained.

### Backend Structure

```
backend/
├── main.go              # HTTP server, all route handlers
├── beets/
│   ├── database.go      # SQLite queries, beets CLI commands
│   └── parse_config.go  # Beets config parsing
└── go.mod
```

### Key Components

1. **PreviewProvider**: Context provider for track preview state
2. **PreviewPanel**: Slide-out panel for track preview/editing (50% width)
3. **Header**: Navigation, search bar, query help
4. **Dashboard**: Albums/Tracks/Stats views with search
5. **AlbumDetail**: Album page with gradient background, track list, metadata tools
6. **ToolsGallery**: Plugin-based tools (duplicates, missing tracks, fetch art, replaygain)

## Known Quirks & Issues

### Critical Quirks

1. **Preview Panel Layout**: 
   - Must be rendered WITHIN each page component (AlbumDetail, Dashboard), not globally
   - Uses flex layout: content (w-1/2) + preview panel (w-1/2, sticky top-16)
   - Header MUST stay outside the flex container or it breaks
   - Background must inherit from page (gradient on album pages)

2. **Genre Display**: 
   - Beets stores genres as null-byte separated strings (`Rock\0Electronic\0Pop`)
   - Always split on `'\0'` and filter empty: `genres.split('\0').filter(g => g.trim()).join(', ')`

3. **Beets Config Parsing**:
   - Plugins field format: `"[fetchart embedart musicbrainz]"` (Go slice format)
   - Parse with: `pluginsStr.replace(/[\[\]]/g, '').trim().split(/\s+/)`

4. **Album Art Paths**:
   - Stored as BLOB in SQLite, need to convert bytes to string
   - Relative paths need music directory prepended
   - Search for `cover.jpg`, `folder.jpg`, `*.jpg` in album directory
   - Use timestamp param (`?t=123`) ONLY when explicitly refetching to bust cache

5. **Missing Tracks**:
   - Use `tracktotal` field or max track number to calculate expected tracks
   - Display missing tracks with `opacity-40` and `missing: true` flag

### Design Issues to Avoid

1. **Don't add gradients** - Removed all gradients except album page background (which is based on album art dominant color)
2. **Don't use universal CSS resets** - Only reset html/body, not `* { margin: 0; padding: 0; }` (breaks layout)
3. **Don't animate on track switch** - Preview panel slide animation should only happen on initial open, not when switching tracks
4. **Don't use margin-right approach** - Preview panel layout must use flex containers, not fixed positioning with margins

### Backend Quirks

1. **Read-Only DB Access**: SQLite is read-only (`file:path?mode=ro`), all writes via beets CLI
2. **Beets CLI Integration**: Use `ExecBeetCommand()` wrapper with proper context and logging
3. **Path Handling**: BLOB fields (path, artpath) need byte-to-string conversion
4. **Metadata Updates**: Use `beet modify` for item edits, `beet update -M` for album refetch (NOT `beet import -L`)

## Common Patterns

### Adding a New Tool

1. Add tool card to `ToolsGallery` tools array:
```javascript
{
  id: 'toolname',
  name: 'Tool Name',
  description: 'Tool description',
  icon: 'fa-solid fa-icon-name',
  plugin: 'pluginname', // or null if built-in
  path: '/tools/toolname'
}
```

2. Create tool component (follow MissingTracksTool pattern)
3. Add route in App component Routes
4. Create backend endpoint if needed

### Adding a Backend Endpoint

1. Add handler registration in `main.go`:
```go
mux.HandleFunc("/api/beets/endpoint", makeEndpointHandler())
```

2. Create handler function following pattern:
```go
func makeEndpointHandler() http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        // Handle request
    }
}
```

3. Add beets function in `database.go` if needed

### Beets Command Patterns

**Query Items**:
```go
_, err := ExecBeetCommand(ctx, "ls", "-f", "$id", query)
```

**Modify Metadata**:
```go
_, err := ExecBeetCommand(ctx, "modify", "-y", query, "field=value")
```

**Fetch Album Art**:
```go
_, err := ExecBeetCommand(ctx, "fetchart", "-q", query)
```

**Fetch Lyrics**:
```go
_, err := ExecBeetCommand(ctx, "lyrics", "-f", query)
```

## Data Models

### Go Structs (backend/beets/database.go)

**Item** (Track):
```go
type Item struct {
    ID          int64
    Title       string
    Artist      string
    Album       string
    AlbumID     sql.NullInt64
    Path        string
    Length      float64  // seconds
    Bitrate     int
    Format      string
    Year        sql.NullInt64
    Track       sql.NullInt64
    TrackTotal  sql.NullInt64
    Disc        sql.NullInt64
    Genres      sql.NullString  // null-byte separated!
    Added       float64  // Unix timestamp
    Lyrics      string
    // ... more fields
}
```

**Album**:
```go
type Album struct {
    ID             int64
    Album          string
    AlbumArtist    string
    ArtPath        sql.NullString  // BLOB in DB
    Year           sql.NullInt64
    Genres         sql.NullString  // null-byte separated!
    Added          float64
    // ... more fields
}
```

### React Props Patterns

**Null Handling**: Always check `.Valid` before accessing `.Int64` or `.String`:
```javascript
{track.year?.Valid && <span>{track.year.Int64}</span>}
```

## Development Workflow

### Starting Dev Server

From project root:
```bash
./dev
```

This runs both frontend (Vite) and backend (Go) concurrently.

### Backend Rebuild

The `dev` script includes backend rebuild. For manual rebuild:
```bash
cd backend
GOPATH="$HOME/go" GOMODCACHE="$HOME/go/pkg/mod" go build -o ./tmp/main .
```

### Testing

1. Start dev server
2. Check logs for database connection
3. Test API endpoints:
   - `curl http://localhost:8080/api/beets/albums`
   - `curl http://localhost:8080/api/beets/items`
   - `curl http://localhost:8080/api/beets/stats`

## API Endpoints

### Query Endpoints
- `GET /api/beets/config` - Beets configuration
- `GET /api/beets/albums` - All albums
- `GET /api/beets/items` - All tracks
- `GET /api/beets/stats` - Library statistics
- `GET /api/beets/search/albums?q=query` - Search albums (full beets query syntax)
- `GET /api/beets/search/items?q=query` - Search tracks (full beets query syntax)
- `GET /api/beets/albums/{id}/art` - Album artwork
- `GET /api/beets/items/{id}/stream` - Stream audio file

### Modification Endpoints
- `POST /api/beets/refetch` - Refetch album metadata from MusicBrainz
- `POST /api/beets/refetch-art` - Refetch album artwork
- `POST /api/beets/modify` - Modify album metadata
- `POST /api/beets/modify-item` - Modify track metadata
- `POST /api/beets/fetch-lyrics` - Fetch lyrics for track

### Tool Endpoints
- `GET /api/beets/duplicates` - Find duplicate albums
- `POST /api/beets/duplicates/merge` - Merge duplicates
- `GET /api/beets/tools/missing-art` - Albums without artwork
- `POST /api/beets/tools/fetch-art` - Fetch art for album
- `POST /api/beets/tools/replaygain` - Apply ReplayGain

## Beets Query Syntax

**Field Queries**: `artist:beatles`, `album:thriller`, `genre:rock`
**Ranges**: `year:2020..2024`, `year:2020..`, `year:..2000`
**Boolean**: `foo bar` (AND), `foo , bar` (OR), `^exclude` (NOT)
**Regex**: `artist::the.*`
**Exact**: `artist:=Beatles`
**Date Ranges**: `added:-1w..`, `added:-1m..-1w`

See full docs in beets repository at /Users/daniel/Projects/beets/docs/reference/query.rst

## UI Features

### Preview Panel
- Opens when clicking any track
- 50% width, sticky positioned below header
- Shows metadata, play button (30s preview), edit form, lyrics
- Click outside to close
- Auto-closes when navigating to Tools
- Inherits page background (gradient on album pages)
- Close button at top-right of content area

### Album Detail Page
- Gradient background extracted from album art (dominant color)
- Album art with refetch/upload options
- Metadata display and edit
- Refetch metadata with diff modal showing changes
- Track list with missing tracks in greyed-out style
- Click track to open preview panel

### Search
- Full beets query syntax support
- Real-time search with query help panel
- Quick search examples (clickable)
- Works on both albums and tracks

### Tools Gallery
- Plugin detection from beets config
- Cards disabled if plugin not available
- Shows setup instructions for missing plugins
- Implemented: Duplicates, Missing Tracks, Fetch Art, ReplayGain

## Important Notes for Next Session

1. **Never break the header** - It must stay full width and outside any flex containers
2. **Preview panel integration is delicate** - Follow the current pattern exactly
3. **Test on ultrawide screens** - Panel should work well at 50% width even on very wide displays
4. **Always use rose colors** - Never emerald/green
5. **Genres need special handling** - Null-byte separated strings
6. **Beets config plugins are Go slice format** - Parse accordingly
7. **Album art caching** - Only use timestamp param when explicitly refetching
8. **SQLite is read-only** - All writes via beets CLI
9. **Single file frontend** - Don't split App.jsx into multiple files
10. **Zerolog for backend logging** - Use `.Debug()`, `.Info()`, `.Error()` patterns

## Recent Changes

- Switched from emerald to rose accent color throughout entire app
- Preview panel redesigned: 50% width, metadata-first, lyrics at bottom
- Added click-away handler to close preview
- Fixed preview panel jitter when switching tracks
- Added fetch lyrics button
- Repositioned close button closer to content
- Fixed header breaking with flex layout
- Changed refetch metadata from `import -L` to `update -M`

## Future Enhancements to Consider

- Lyrics tool (batch fetch for albums/library)
- Convert tool (audio format conversion)
- Smart playlist generation
- Album art editor (crop, adjust)
- Duplicate track merger (not just albums)
- Full-text search
- Keyboard shortcuts
- Mobile responsive design
- Dark/light theme toggle (currently dark only)
