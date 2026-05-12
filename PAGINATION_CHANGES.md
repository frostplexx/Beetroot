# Library Pagination Improvements

## Summary
Optimized Beetroot to handle large music libraries efficiently by implementing pagination and reducing unnecessary beets database calls.

## Backend Changes

### New Endpoints
1. **`GET /api/beets/albums/count`** - Returns total album count
2. **`GET /api/beets/items/count`** - Returns total track count
3. **`GET /api/beets/albums/by-id/{id}`** - Fetch single album by ID
4. **`GET /api/beets/items/by-album/{id}`** - Fetch tracks for specific album

### Updated Endpoints
1. **`GET /api/beets/albums`** - Now accepts `limit` and `offset` query parameters
   - Default: `limit=50`
   - Example: `/api/beets/albums?limit=50&offset=0`

2. **`GET /api/beets/items`** - Now accepts `limit` and `offset` query parameters
   - Default: `limit=100`
   - Example: `/api/beets/items?limit=100&offset=0`

### Database Layer
Added helper methods in `database.go`:
- `GetAlbumsCount()` - Count total albums
- `GetItemsCount()` - Count total tracks

## Frontend Changes

### Dashboard Component
1. **Added pagination state**:
   - `albumsPage` / `itemsPage` - Current page number
   - `albumsTotal` / `itemsTotal` - Total count from database
   - `albumsPerPage=50` / `itemsPerPage=100` - Items per page

2. **Lazy loading**: Only fetches the current page of data when needed

3. **Pagination controls**: Previous/Next buttons with page indicators

### Album Detail Page
- Changed from fetching ALL albums/items to only fetching the specific album and its tracks
- Uses new specific endpoints: `/api/beets/albums/by-id/{id}` and `/api/beets/items/by-album/{id}`

## Performance Impact

### Before
- Dashboard: Loads ALL albums + ALL tracks on initial load
- Album detail: Loads ALL albums + ALL tracks to find one album
- Large library (10k+ tracks): Multiple seconds load time, high memory usage

### After
- Dashboard: Loads only 50 albums OR 100 tracks per page
- Album detail: Loads only 1 album + its tracks
- Large library: Sub-second load times, minimal memory usage
- Pagination allows instant navigation without re-querying

## Migration Notes

- **Backwards compatible**: Search functionality still works as before
- **No database changes**: Only query optimization
- **MissingTracksTool**: Still loads all data (needed for analysis)
