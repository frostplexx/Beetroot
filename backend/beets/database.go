// Database operations for beets

package beets

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"github.com/rs/zerolog/log"
)

// DB wraps the SQLite connection and provides query methods
type DB struct {
	conn *sql.DB
	path string
}

// Item represents a track/song in the library
type Item struct {
	ID                 int64          `json:"id"`
	Title              string         `json:"title"`
	Artist             string         `json:"artist"`
	ArtistSort         string         `json:"artist_sort"`
	Album              string         `json:"album"`
	AlbumID            sql.NullInt64  `json:"album_id"`
	AlbumArtist        string         `json:"albumartist"`
	Path               string         `json:"path"`
	Length             float64        `json:"length"`
	Bitrate            int            `json:"bitrate"`
	Format             string         `json:"format"`
	Year               sql.NullInt64  `json:"year"`
	Month              sql.NullInt64  `json:"month"`
	Day                sql.NullInt64  `json:"day"`
	Track              sql.NullInt64  `json:"track"`
	TrackTotal         sql.NullInt64  `json:"tracktotal"`
	Disc               sql.NullInt64  `json:"disc"`
	DiscTotal          sql.NullInt64  `json:"disctotal"`
	Genres             sql.NullString `json:"genres"`
	Lyrics             sql.NullString `json:"lyrics"`
	ISRC               sql.NullString `json:"isrc"`
	Comp               sql.NullInt64  `json:"comp"`
	MusicBrainzTrackID sql.NullString `json:"mb_trackid"`
	MusicBrainzAlbumID sql.NullString `json:"mb_albumid"`
	Added              float64        `json:"added"`
	Modified           float64        `json:"mtime"`
}

// Album represents an album in the library
type Album struct {
	ID                        int64          `json:"id"`
	Album                     string         `json:"album"`
	AlbumArtist               string         `json:"albumartist"`
	AlbumArtistSort           string         `json:"albumartist_sort"`
	AlbumType                 sql.NullString `json:"albumtype"`
	ArtPath                   sql.NullString `json:"artpath"`
	Year                      sql.NullInt64  `json:"year"`
	Month                     sql.NullInt64  `json:"month"`
	Day                       sql.NullInt64  `json:"day"`
	Country                   sql.NullString `json:"country"`
	Label                     sql.NullString `json:"label"`
	Genres                    sql.NullString `json:"genres"`
	DiscTotal                 sql.NullInt64  `json:"disctotal"`
	Comp                      sql.NullInt64  `json:"comp"`
	CatalogNum                sql.NullString `json:"catalognum"`
	Barcode                   sql.NullString `json:"barcode"`
	AlbumStatus               sql.NullString `json:"albumstatus"`
	MusicBrainzAlbumID        sql.NullString `json:"mb_albumid"`
	MusicBrainzReleaseGroupID sql.NullString `json:"mb_releasegroupid"`
	Added                     float64        `json:"added"`
}

// QueryOptions for pagination and ordering
type QueryOptions struct {
	Limit   int
	Offset  int
	OrderBy string
}

// SearchOptions for searching with beets query syntax
type SearchOptions struct {
	Query string
	Limit int
}

// QueryItems queries items using beets query syntax
func (db *DB) QueryItems(ctx context.Context, query string) ([]Item, error) {
	// Use beets to get item IDs matching the query
	args := []string{}
	if query != "" {
		args = append(args, query)
	}
	args = append(args, "-f", "$id")

	log.Debug().Str("query", query).Msg("Executing beets query for items")

	output, err := ExecBeetCommand(ctx, "ls", args...)
	if err != nil {
		return nil, fmt.Errorf("error executing beets query: %w", err)
	}

	if output == "" {
		return []Item{}, nil
	}

	// Parse IDs from output (one per line)
	lines := strings.Split(strings.TrimSpace(output), "\n")
	var items []Item

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		id, err := strconv.ParseInt(line, 10, 64)
		if err != nil {
			log.Warn().Str("line", line).Msg("Failed to parse item ID")
			continue
		}

		item, err := db.GetItemByID(ctx, id)
		if err != nil {
			log.Warn().Int64("id", id).Err(err).Msg("Failed to get item by ID")
			continue
		}

		items = append(items, *item)
	}

	log.Debug().Int("count", len(items)).Str("query", query).Msg("Query completed")
	return items, nil
}

// RefetchAlbumMetadata refetches metadata for an album from MusicBrainz
func RefetchAlbumMetadata(ctx context.Context, albumID int64) error {
	query := fmt.Sprintf("id:%d", albumID)
	log.Info().Int64("album_id", albumID).Str("query", query).Msg("Refetching album metadata")

	// Use beet import -L to reimport from library
	// This re-fetches metadata from MusicBrainz using the full matching engine
	// -L: query from library (not filesystem)
	// -C: don't copy files
	// -M: don't move files (keep in place)
	// -q: quiet mode (non-interactive, uses quiet_fallback config)
	output, err := ExecBeetCommand(ctx, "import", "-L", "-C", "-M", "-q", query)
	if err != nil {
		log.Error().Err(err).Str("output", output).Msg("Failed to refetch metadata")
		return fmt.Errorf("error refetching metadata: %w", err)
	}

	log.Info().Str("output", output).Msg("Metadata refetch completed")
	return nil
}

// RefetchAlbumArt refetches album art for an album
func RefetchAlbumArt(ctx context.Context, albumID int64) error {
	query := fmt.Sprintf("id:%d", albumID)
	log.Info().Int64("album_id", albumID).Msg("Refetching album art")

	// Use beet fetchart with -f (force) to re-download even if art exists
	output, err := ExecBeetCommand(ctx, "fetchart", "-f", query)
	if err != nil {
		return fmt.Errorf("error refetching album art: %w", err)
	}

	// Check if beets actually found art
	if strings.Contains(output, "no art found") {
		return fmt.Errorf("no album art found for this album")
	}

	log.Info().Str("output", output).Msg("Album art refetched successfully")
	return nil
}

// ModifyAlbumMetadata modifies album metadata
func ModifyAlbumMetadata(ctx context.Context, albumID int64, updates map[string]string) error {
	// Validate album ID
	if albumID <= 0 {
		return fmt.Errorf("invalid album ID")
	}

	// For albums, use "id:" not "album_id:"
	query := fmt.Sprintf("id:%d", albumID)

	// Build field=value arguments with validation
	// Add -a flag to modify albums (not items)
	args := []string{"-a", "-y", query}
	for field, value := range updates {
		// Validate field name (whitelist)
		if err := validateMetadataField(field); err != nil {
			return fmt.Errorf("invalid field: %w", err)
		}
		// Sanitize value
		sanitized, err := sanitizeMetadataValue(value)
		if err != nil {
			return fmt.Errorf("invalid value for field %s: %w", field, err)
		}
		args = append(args, fmt.Sprintf("%s=%s", field, sanitized))
	}

	log.Info().Int64("album_id", albumID).Interface("updates", updates).Msg("Modifying album metadata")

	_, err := ExecBeetCommand(ctx, "modify", args...)
	if err != nil {
		return fmt.Errorf("error modifying metadata: %w", err)
	}

	return nil
}

// FindDuplicateAlbums finds potential duplicate albums
func FindDuplicateAlbums(ctx context.Context) ([]map[string]interface{}, error) {
	log.Debug().Msg("Finding duplicate albums using similarity matching")

	dbPath, err := GetDatabasePath(ctx)
	if err != nil {
		return nil, fmt.Errorf("error getting database path: %w", err)
	}

	db, err := OpenDB(ctx, dbPath)
	if err != nil {
		return nil, fmt.Errorf("error opening database: %w", err)
	}
	defer db.Close()

	// Get all albums grouped by artist
	query := `
		SELECT id, album, albumartist,
		       (SELECT COUNT(*) FROM items WHERE items.album_id = albums.id) as track_count
		FROM albums
		ORDER BY albumartist, album
	`

	rows, err := db.conn.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("error querying albums: %w", err)
	}
	defer rows.Close()

	type albumInfo struct {
		id          int64
		album       string
		albumartist string
		trackCount  int
	}

	albums := make([]albumInfo, 0)
	for rows.Next() {
		var a albumInfo
		if err := rows.Scan(&a.id, &a.album, &a.albumartist, &a.trackCount); err != nil {
			continue
		}
		albums = append(albums, a)
	}

	// Find similar albums by the same artist
	duplicates := make([]map[string]interface{}, 0)
	seen := make(map[string]bool)

	for i := 0; i < len(albums); i++ {
		for j := i + 1; j < len(albums); j++ {
			// Must be same artist
			if albums[i].albumartist != albums[j].albumartist {
				continue
			}

			// Calculate similarity
			similarity := stringSimilarity(albums[i].album, albums[j].album)

			// Flag as potential duplicate if similar enough (70% threshold)
			if similarity >= 0.70 {
				key := fmt.Sprintf("%s|%s|%s", albums[i].albumartist, albums[i].album, albums[j].album)
				if seen[key] {
					continue
				}
				seen[key] = true

				duplicates = append(duplicates, map[string]interface{}{
					"info":       fmt.Sprintf("%s - %s / %s", albums[i].albumartist, albums[i].album, albums[j].album),
					"album1_id":  albums[i].id,
					"album1":     albums[i].album,
					"album2_id":  albums[j].id,
					"album2":     albums[j].album,
					"tracks1":    albums[i].trackCount,
					"tracks2":    albums[j].trackCount,
					"similarity": similarity,
				})
			}
		}
	}

	return duplicates, nil
}

// stringSimilarity calculates similarity between two strings using normalized edit distance
func stringSimilarity(s1, s2 string) float64 {
	s1 = strings.ToLower(strings.TrimSpace(s1))
	s2 = strings.ToLower(strings.TrimSpace(s2))

	if s1 == s2 {
		return 1.0
	}

	// Calculate Levenshtein distance
	distance := levenshteinDistance(s1, s2)
	maxLen := max(len(s1), len(s2))

	if maxLen == 0 {
		return 1.0
	}

	return 1.0 - float64(distance)/float64(maxLen)
}

// levenshteinDistance calculates the Levenshtein distance between two strings
func levenshteinDistance(s1, s2 string) int {
	if len(s1) == 0 {
		return len(s2)
	}
	if len(s2) == 0 {
		return len(s1)
	}

	matrix := make([][]int, len(s1)+1)
	for i := range matrix {
		matrix[i] = make([]int, len(s2)+1)
		matrix[i][0] = i
	}
	for j := range matrix[0] {
		matrix[0][j] = j
	}

	for i := 1; i <= len(s1); i++ {
		for j := 1; j <= len(s2); j++ {
			cost := 1
			if s1[i-1] == s2[j-1] {
				cost = 0
			}
			matrix[i][j] = min(
				matrix[i-1][j]+1,      // deletion
				matrix[i][j-1]+1,      // insertion
				matrix[i-1][j-1]+cost, // substitution
			)
		}
	}

	return matrix[len(s1)][len(s2)]
}

func min(a, b, c int) int {
	if a < b {
		if a < c {
			return a
		}
		return c
	}
	if b < c {
		return b
	}
	return c
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// MergeDuplicateAlbums merges two albums by moving all tracks from discard to keep album
func MergeDuplicateAlbums(ctx context.Context, keepAlbumID, discardAlbumID int64) error {
	log.Info().Int64("keep", keepAlbumID).Int64("discard", discardAlbumID).Msg("Merging duplicate albums")

	dbPath, err := GetDatabasePath(ctx)
	if err != nil {
		return fmt.Errorf("error getting database path: %w", err)
	}

	// Open database in read-write mode for merging
	connStr := fmt.Sprintf("file:%s?mode=rw", dbPath)
	conn, err := sql.Open("sqlite", connStr)
	if err != nil {
		return fmt.Errorf("error opening database: %w", err)
	}
	defer conn.Close()

	// Start transaction
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("error starting transaction: %w", err)
	}
	defer tx.Rollback()

	// Update all items from discard album to point to keep album
	_, err = tx.ExecContext(ctx, "UPDATE items SET album_id = ? WHERE album_id = ?", keepAlbumID, discardAlbumID)
	if err != nil {
		return fmt.Errorf("error updating items: %w", err)
	}

	// Delete the discard album
	_, err = tx.ExecContext(ctx, "DELETE FROM albums WHERE id = ?", discardAlbumID)
	if err != nil {
		return fmt.Errorf("error deleting album: %w", err)
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("error committing transaction: %w", err)
	}

	log.Info().Int64("keep", keepAlbumID).Int64("discard", discardAlbumID).Msg("Successfully merged albums")
	return nil
}

// QueryAlbums queries albums using beets query syntax
func (db *DB) QueryAlbums(ctx context.Context, query string) ([]Album, error) {
	// Use beets to get album IDs matching the query
	args := []string{"-a"}
	if query != "" {
		args = append(args, query)
	}
	args = append(args, "-f", "$id")

	log.Debug().Str("query", query).Msg("Executing beets query for albums")

	output, err := ExecBeetCommand(ctx, "ls", args...)
	if err != nil {
		return nil, fmt.Errorf("error executing beets query: %w", err)
	}

	if output == "" {
		return []Album{}, nil
	}

	// Parse IDs from output (one per line)
	lines := strings.Split(strings.TrimSpace(output), "\n")
	var albums []Album

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		id, err := strconv.ParseInt(line, 10, 64)
		if err != nil {
			log.Warn().Str("line", line).Msg("Failed to parse album ID")
			continue
		}

		album, err := db.GetAlbumByID(ctx, id)
		if err != nil {
			log.Warn().Int64("id", id).Err(err).Msg("Failed to get album by ID")
			continue
		}

		albums = append(albums, *album)
	}

	log.Debug().Int("count", len(albums)).Str("query", query).Msg("Query completed")
	return albums, nil
}

// GetDatabasePath retrieves the database path from config or uses default
func GetDatabasePath(ctx context.Context) (string, error) {
	if dbPath := strings.TrimSpace(os.Getenv("BEETROOT_DATABASE_PATH")); dbPath != "" {
		return expandPath(dbPath), nil
	}

	config, _, err := ParseBeetsConfig(ctx)
	if err != nil {
		return "", fmt.Errorf("error parsing beets config: %w", err)
	}

	if dbPath, ok := config["library"]; ok {
		return expandPath(dbPath), nil
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("error getting user home directory: %w", err)
	}

	return filepath.Join(homeDir, ".config", "beets", "library.db"), nil
}

// expandPath expands ~ to home directory and evaluates path
func expandPath(path string) string {
	if strings.HasPrefix(path, "~/") {
		homeDir, _ := os.UserHomeDir()
		return filepath.Join(homeDir, path[2:])
	}
	return path
}

// OpenDB opens a connection to the beets SQLite database
func OpenDB(ctx context.Context, dbPath string) (*DB, error) {
	log.Debug().Str("path", dbPath).Msg("Opening beets database")

	if _, err := os.Stat(dbPath); err != nil {
		return nil, fmt.Errorf("database file not found at %s: %w", dbPath, err)
	}

	connStr := fmt.Sprintf("file:%s?mode=ro", dbPath)
	conn, err := sql.Open("sqlite", connStr)
	if err != nil {
		return nil, fmt.Errorf("error opening database: %w", err)
	}

	conn.SetMaxOpenConns(5)
	conn.SetMaxIdleConns(2)
	conn.SetConnMaxLifetime(time.Hour)

	if err := conn.PingContext(ctx); err != nil {
		conn.Close()
		return nil, fmt.Errorf("error pinging database: %w", err)
	}

	log.Info().Str("path", dbPath).Msg("Successfully connected to beets database")

	return &DB{
		conn: conn,
		path: dbPath,
	}, nil
}

// Close closes the database connection
func (db *DB) Close() error {
	log.Debug().Str("path", db.path).Msg("Closing beets database connection")
	return db.conn.Close()
}

// GetItems retrieves items from the database with optional filtering
func (db *DB) GetItems(ctx context.Context, opts QueryOptions) ([]Item, error) {
	query := `SELECT
		id, title, artist, artist_sort, album, album_id, albumartist,
		path, length, bitrate, format, year, month, day,
		track, tracktotal, disc, disctotal, genres, lyrics,
		mb_trackid, mb_albumid, added, mtime
	FROM items`

	if opts.OrderBy != "" {
		query += " ORDER BY " + opts.OrderBy
	} else {
		query += " ORDER BY artist, album, disc, track"
	}

	if opts.Limit > 0 {
		query += fmt.Sprintf(" LIMIT %d", opts.Limit)
	}
	if opts.Offset > 0 {
		query += fmt.Sprintf(" OFFSET %d", opts.Offset)
	}

	log.Debug().Str("query", query).Msg("Executing items query")

	rows, err := db.conn.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("error querying items: %w", err)
	}
	defer rows.Close()

	var items []Item
	for rows.Next() {
		var item Item
		var pathBytes []byte

		err := rows.Scan(
			&item.ID, &item.Title, &item.Artist, &item.ArtistSort,
			&item.Album, &item.AlbumID, &item.AlbumArtist,
			&pathBytes, &item.Length, &item.Bitrate, &item.Format,
			&item.Year, &item.Month, &item.Day,
			&item.Track, &item.TrackTotal, &item.Disc, &item.DiscTotal,
			&item.Genres, &item.Lyrics, &item.MusicBrainzTrackID, &item.MusicBrainzAlbumID,
			&item.Added, &item.Modified,
		)
		if err != nil {
			return nil, fmt.Errorf("error scanning item: %w", err)
		}

		item.Path = string(pathBytes)
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating items: %w", err)
	}

	log.Debug().Int("count", len(items)).Msg("Retrieved items from database")
	return items, nil
}

// GetItemByID retrieves a single item by ID
func (db *DB) GetItemByID(ctx context.Context, id int64) (*Item, error) {
	query := `SELECT
		id, title, artist, artist_sort, album, album_id, albumartist,
		path, length, bitrate, format, year, month, day,
		track, tracktotal, disc, disctotal, genres, lyrics,
		mb_trackid, mb_albumid, added, mtime
	FROM items WHERE id = ?`

	log.Debug().Int64("id", id).Msg("Querying item by ID")

	var item Item
	var pathBytes []byte

	err := db.conn.QueryRowContext(ctx, query, id).Scan(
		&item.ID, &item.Title, &item.Artist, &item.ArtistSort,
		&item.Album, &item.AlbumID, &item.AlbumArtist,
		&pathBytes, &item.Length, &item.Bitrate, &item.Format,
		&item.Year, &item.Month, &item.Day,
		&item.Track, &item.TrackTotal, &item.Disc, &item.DiscTotal,
		&item.Genres, &item.MusicBrainzTrackID, &item.MusicBrainzAlbumID,
		&item.Added, &item.Modified,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("item with id %d not found", id)
	}
	if err != nil {
		return nil, fmt.Errorf("error querying item: %w", err)
	}

	item.Path = string(pathBytes)
	return &item, nil
}

// GetAlbumsCount returns the total number of albums
func (db *DB) GetAlbumsCount(ctx context.Context) (int64, error) {
	var count int64
	err := db.conn.QueryRowContext(ctx, "SELECT COUNT(*) FROM albums").Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("error counting albums: %w", err)
	}
	return count, nil
}

// GetItemsCount returns the total number of items
func (db *DB) GetItemsCount(ctx context.Context) (int64, error) {
	var count int64
	err := db.conn.QueryRowContext(ctx, "SELECT COUNT(*) FROM items").Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("error counting items: %w", err)
	}
	return count, nil
}

// GetAlbums retrieves albums from the database
func (db *DB) GetAlbums(ctx context.Context, opts QueryOptions) ([]Album, error) {
	query := `SELECT
		id, album, albumartist, albumartist_sort, albumtype, artpath,
		year, month, day, country, label, genres, disctotal,
		mb_albumid, mb_releasegroupid, added
	FROM albums`

	if opts.OrderBy != "" {
		query += " ORDER BY " + opts.OrderBy
	} else {
		query += " ORDER BY albumartist, album, year"
	}

	if opts.Limit > 0 {
		query += fmt.Sprintf(" LIMIT %d", opts.Limit)
	}
	if opts.Offset > 0 {
		query += fmt.Sprintf(" OFFSET %d", opts.Offset)
	}

	log.Debug().Str("query", query).Msg("Executing albums query")

	rows, err := db.conn.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("error querying albums: %w", err)
	}
	defer rows.Close()

	var albums []Album
	for rows.Next() {
		var album Album
		var artPathBytes []byte

		err := rows.Scan(
			&album.ID, &album.Album, &album.AlbumArtist, &album.AlbumArtistSort,
			&album.AlbumType, &artPathBytes, &album.Year, &album.Month, &album.Day,
			&album.Country, &album.Label, &album.Genres, &album.DiscTotal,
			&album.MusicBrainzAlbumID, &album.MusicBrainzReleaseGroupID, &album.Added,
		)
		if err != nil {
			return nil, fmt.Errorf("error scanning album: %w", err)
		}

		if len(artPathBytes) > 0 {
			album.ArtPath = sql.NullString{String: string(artPathBytes), Valid: true}
		}
		albums = append(albums, album)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating albums: %w", err)
	}

	log.Debug().Int("count", len(albums)).Msg("Retrieved albums from database")
	return albums, nil
}

// GetAlbumByID retrieves a single album by ID
func (db *DB) GetAlbumByID(ctx context.Context, id int64) (*Album, error) {
	query := `SELECT
		id, album, albumartist, albumartist_sort, albumtype, artpath,
		year, month, day, country, label, genres, disctotal, comp,
		catalognum, barcode, albumstatus,
		mb_albumid, mb_releasegroupid, added
	FROM albums WHERE id = ?`

	log.Debug().Int64("id", id).Msg("Querying album by ID")

	var album Album
	var artPathBytes []byte

	err := db.conn.QueryRowContext(ctx, query, id).Scan(
		&album.ID, &album.Album, &album.AlbumArtist, &album.AlbumArtistSort,
		&album.AlbumType, &artPathBytes, &album.Year, &album.Month, &album.Day,
		&album.Country, &album.Label, &album.Genres, &album.DiscTotal, &album.Comp,
		&album.CatalogNum, &album.Barcode, &album.AlbumStatus,
		&album.MusicBrainzAlbumID, &album.MusicBrainzReleaseGroupID, &album.Added,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("album with id %d not found", id)
	}
	if err != nil {
		return nil, fmt.Errorf("error querying album: %w", err)
	}

	if len(artPathBytes) > 0 {
		album.ArtPath = sql.NullString{String: string(artPathBytes), Valid: true}
	}
	return &album, nil
}

// GetItemsByAlbumID retrieves all items for a specific album
func (db *DB) GetItemsByAlbumID(ctx context.Context, albumID int64) ([]Item, error) {
	query := `SELECT
		id, title, artist, artist_sort, album, album_id, albumartist,
		path, length, bitrate, format, year, month, day,
		track, tracktotal, disc, disctotal, genres, lyrics, isrc, comp,
		mb_trackid, mb_albumid, added, mtime
	FROM items
	WHERE album_id = ?
	ORDER BY disc, track`

	log.Debug().Int64("album_id", albumID).Msg("Querying items by album ID")

	rows, err := db.conn.QueryContext(ctx, query, albumID)
	if err != nil {
		return nil, fmt.Errorf("error querying items by album: %w", err)
	}
	defer rows.Close()

	var items []Item
	for rows.Next() {
		var item Item
		var pathBytes []byte

		err := rows.Scan(
			&item.ID, &item.Title, &item.Artist, &item.ArtistSort,
			&item.Album, &item.AlbumID, &item.AlbumArtist,
			&pathBytes, &item.Length, &item.Bitrate, &item.Format,
			&item.Year, &item.Month, &item.Day,
			&item.Track, &item.TrackTotal, &item.Disc, &item.DiscTotal,
			&item.Genres, &item.Lyrics, &item.ISRC, &item.Comp,
			&item.MusicBrainzTrackID, &item.MusicBrainzAlbumID,
			&item.Added, &item.Modified,
		)
		if err != nil {
			return nil, fmt.Errorf("error scanning item: %w", err)
		}

		item.Path = string(pathBytes)
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating items: %w", err)
	}

	log.Debug().Int("count", len(items)).Int64("album_id", albumID).Msg("Retrieved items for album")
	return items, nil
}

// GetStats returns statistics about the library
func (db *DB) GetStats(ctx context.Context) (map[string]int64, error) {
	stats := make(map[string]int64)

	var totalItems int64
	err := db.conn.QueryRowContext(ctx, "SELECT COUNT(*) FROM items").Scan(&totalItems)
	if err != nil {
		return nil, fmt.Errorf("error counting items: %w", err)
	}
	stats["total_items"] = totalItems

	var totalAlbums int64
	err = db.conn.QueryRowContext(ctx, "SELECT COUNT(*) FROM albums").Scan(&totalAlbums)
	if err != nil {
		return nil, fmt.Errorf("error counting albums: %w", err)
	}
	stats["total_albums"] = totalAlbums

	var totalArtists int64
	err = db.conn.QueryRowContext(ctx, "SELECT COUNT(DISTINCT artist) FROM items").Scan(&totalArtists)
	if err != nil {
		return nil, fmt.Errorf("error counting artists: %w", err)
	}
	stats["total_artists"] = totalArtists

	var totalDuration sql.NullFloat64
	err = db.conn.QueryRowContext(ctx, "SELECT SUM(length) FROM items").Scan(&totalDuration)
	if err != nil {
		return nil, fmt.Errorf("error calculating total duration: %w", err)
	}
	if totalDuration.Valid {
		stats["total_duration_seconds"] = int64(totalDuration.Float64)
	}

	log.Debug().Interface("stats", stats).Msg("Retrieved library statistics")
	return stats, nil
}

// SearchItems searches for items matching the query string
func (db *DB) SearchItems(ctx context.Context, query string, limit int) ([]Item, error) {
	if query == "" {
		return db.GetItems(ctx, QueryOptions{Limit: limit})
	}

	searchQuery := `SELECT
		id, title, artist, artist_sort, album, album_id, albumartist,
		path, length, bitrate, format, year, month, day,
		track, tracktotal, disc, disctotal, genres,
		mb_trackid, mb_albumid, added, mtime
	FROM items
	WHERE title LIKE ? OR artist LIKE ? OR album LIKE ? OR albumartist LIKE ?
	ORDER BY artist, album, disc, track`

	if limit > 0 {
		searchQuery += fmt.Sprintf(" LIMIT %d", limit)
	}

	searchPattern := "%" + query + "%"
	log.Debug().Str("query", query).Msg("Searching items")

	rows, err := db.conn.QueryContext(ctx, searchQuery, searchPattern, searchPattern, searchPattern, searchPattern)
	if err != nil {
		return nil, fmt.Errorf("error searching items: %w", err)
	}
	defer rows.Close()

	var items []Item
	for rows.Next() {
		var item Item
		var pathBytes []byte

		err := rows.Scan(
			&item.ID, &item.Title, &item.Artist, &item.ArtistSort,
			&item.Album, &item.AlbumID, &item.AlbumArtist,
			&pathBytes, &item.Length, &item.Bitrate, &item.Format,
			&item.Year, &item.Month, &item.Day,
			&item.Track, &item.TrackTotal, &item.Disc, &item.DiscTotal,
			&item.Genres, &item.Lyrics, &item.MusicBrainzTrackID, &item.MusicBrainzAlbumID,
			&item.Added, &item.Modified,
		)
		if err != nil {
			return nil, fmt.Errorf("error scanning item: %w", err)
		}

		item.Path = string(pathBytes)
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating items: %w", err)
	}

	log.Debug().Int("count", len(items)).Str("query", query).Msg("Search completed")
	return items, nil
}

// SearchAlbums searches for albums matching the query string
func (db *DB) SearchAlbums(ctx context.Context, query string, limit int) ([]Album, error) {
	if query == "" {
		return db.GetAlbums(ctx, QueryOptions{Limit: limit})
	}

	searchQuery := `SELECT
		id, album, albumartist, albumartist_sort, albumtype, artpath,
		year, month, day, country, label, genres, disctotal,
		mb_albumid, mb_releasegroupid, added
	FROM albums
	WHERE album LIKE ? OR albumartist LIKE ? OR label LIKE ? OR genres LIKE ?
	ORDER BY albumartist, album, year`

	if limit > 0 {
		searchQuery += fmt.Sprintf(" LIMIT %d", limit)
	}

	searchPattern := "%" + query + "%"
	log.Debug().Str("query", query).Msg("Searching albums")

	rows, err := db.conn.QueryContext(ctx, searchQuery, searchPattern, searchPattern, searchPattern, searchPattern)
	if err != nil {
		return nil, fmt.Errorf("error searching albums: %w", err)
	}
	defer rows.Close()

	var albums []Album
	for rows.Next() {
		var album Album
		var artPathBytes []byte

		err := rows.Scan(
			&album.ID, &album.Album, &album.AlbumArtist, &album.AlbumArtistSort,
			&album.AlbumType, &artPathBytes, &album.Year, &album.Month, &album.Day,
			&album.Country, &album.Label, &album.Genres, &album.DiscTotal,
			&album.MusicBrainzAlbumID, &album.MusicBrainzReleaseGroupID, &album.Added,
		)
		if err != nil {
			return nil, fmt.Errorf("error scanning album: %w", err)
		}

		if len(artPathBytes) > 0 {
			album.ArtPath = sql.NullString{String: string(artPathBytes), Valid: true}
		}
		albums = append(albums, album)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating albums: %w", err)
	}

	log.Debug().Int("count", len(albums)).Str("query", query).Msg("Search completed")
	return albums, nil
}

// GetAlbumsWithoutArt returns albums that don't have album art
func (db *DB) GetAlbumsWithoutArt(ctx context.Context) ([]Album, error) {
	query := `SELECT
		id, album, albumartist, albumartist_sort, albumtype, artpath,
		year, month, day, country, label, genres, disctotal,
		mb_albumid, mb_releasegroupid, added
	FROM albums
	WHERE artpath IS NULL OR artpath = ''
	ORDER BY albumartist, album`

	log.Debug().Msg("Querying albums without artwork")

	rows, err := db.conn.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("error querying albums without art: %w", err)
	}
	defer rows.Close()

	var albums []Album
	for rows.Next() {
		var album Album
		err := rows.Scan(
			&album.ID, &album.Album, &album.AlbumArtist, &album.AlbumArtistSort,
			&album.AlbumType, &album.ArtPath, &album.Year, &album.Month, &album.Day,
			&album.Country, &album.Label, &album.Genres, &album.DiscTotal,
			&album.MusicBrainzAlbumID, &album.MusicBrainzReleaseGroupID, &album.Added,
		)
		if err != nil {
			return nil, fmt.Errorf("error scanning album: %w", err)
		}
		albums = append(albums, album)
	}

	log.Debug().Int("count", len(albums)).Msg("Found albums without artwork")
	return albums, nil
}

// FetchArtForAlbum fetches artwork for a specific album
func FetchArtForAlbum(ctx context.Context, albumID int64) error {
	query := fmt.Sprintf("id:%d", albumID)
	log.Info().Int64("album_id", albumID).Msg("Fetching artwork for album")

	_, err := ExecBeetCommand(ctx, "fetchart", "-q", query)
	if err != nil {
		return fmt.Errorf("error fetching artwork: %w", err)
	}

	return nil
}

// ApplyReplayGain applies ReplayGain to albums or items
func ApplyReplayGain(ctx context.Context, query string, album bool) error {
	// Sanitize query to prevent command injection
	sanitized, err := sanitizeBeetsQuery(query)
	if err != nil {
		return fmt.Errorf("invalid query: %w", err)
	}

	log.Info().Str("query", sanitized).Bool("album", album).Msg("Applying ReplayGain")

	args := []string{}
	if album {
		args = append(args, "-a")
	}
	args = append(args, sanitized)

	_, err = ExecBeetCommand(ctx, "replaygain", args...)
	if err != nil {
		return fmt.Errorf("error applying replaygain: %w", err)
	}

	return nil
}

// ModifyItemMetadata modifies track/item metadata
func ModifyItemMetadata(ctx context.Context, itemID int64, updates map[string]string) error {
	// Validate item ID
	if itemID <= 0 {
		return fmt.Errorf("invalid item ID")
	}

	query := fmt.Sprintf("id:%d", itemID)

	// Build field=value arguments with validation
	args := []string{query}
	for field, value := range updates {
		// Validate field name (whitelist)
		if err := validateMetadataField(field); err != nil {
			return fmt.Errorf("invalid field: %w", err)
		}
		// Sanitize value
		sanitized, err := sanitizeMetadataValue(value)
		if err != nil {
			return fmt.Errorf("invalid value for field %s: %w", field, err)
		}
		args = append(args, fmt.Sprintf("%s=%s", field, sanitized))
	}

	log.Info().Int64("item_id", itemID).Interface("updates", updates).Msg("Modifying item metadata")

	_, err := ExecBeetCommand(ctx, "modify", append([]string{"-y"}, args...)...)
	if err != nil {
		return fmt.Errorf("error modifying item metadata: %w", err)
	}

	return nil
}

// FetchLyricsForItem fetches lyrics for a specific item using beet lyrics command
func FetchLyricsForItem(ctx context.Context, itemID int64) error {
	query := fmt.Sprintf("id:%d", itemID)

	log.Info().Int64("item_id", itemID).Msg("Fetching lyrics for item")

	_, err := ExecBeetCommand(ctx, "lyrics", "-f", query)
	if err != nil {
		return fmt.Errorf("error fetching lyrics: %w", err)
	}

	return nil
}

// OrphanedFile represents a file in the music directory that's not tracked by beets
type OrphanedFile struct {
	Path         string `json:"path"`
	RelativePath string `json:"relative_path"`
	Size         int64  `json:"size"`
}

// FindOrphanedFiles finds audio files in the music directory that aren't tracked by beets
func (db *DB) FindOrphanedFiles(ctx context.Context) ([]OrphanedFile, error) {
	log.Info().Msg("Finding orphaned files in music directory")

	// Get music directory from beets config
	config, _, err := ParseBeetsConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("error parsing beets config: %w", err)
	}

	musicDir, ok := config["directory"]
	if !ok {
		return nil, fmt.Errorf("directory path not found in beets config")
	}

	// Expand the music directory path
	musicDir = expandPath(musicDir)

	log.Debug().Str("music_dir", musicDir).Msg("Music directory")

	// Get all tracked paths from database
	query := `SELECT path FROM items`
	rows, err := db.conn.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("error querying tracked files: %w", err)
	}
	defer rows.Close()

	trackedPaths := make(map[string]bool)
	for rows.Next() {
		var pathBytes []byte
		if err := rows.Scan(&pathBytes); err != nil {
			return nil, fmt.Errorf("error scanning path: %w", err)
		}
		path := string(pathBytes)

		// Convert to absolute path if relative
		if !filepath.IsAbs(path) {
			path = filepath.Join(musicDir, path)
		}

		// Clean the path for consistent comparison
		path = filepath.Clean(path)
		trackedPaths[path] = true
	}

	log.Debug().Int("tracked_count", len(trackedPaths)).Msg("Tracked files in database")

	// Supported audio formats
	audioExtensions := map[string]bool{
		".mp3":  true,
		".flac": true,
		".m4a":  true,
		".aac":  true,
		".ogg":  true,
		".opus": true,
		".wma":  true,
		".wav":  true,
		".ape":  true,
		".wv":   true,
		".mpc":  true,
		".tta":  true,
		".aiff": true,
		".dsf":  true,
		".dff":  true,
	}

	// Walk the music directory and find untracked audio files
	var orphanedFiles []OrphanedFile
	err = filepath.Walk(musicDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			log.Warn().Err(err).Str("path", path).Msg("Error accessing path")
			return nil // Continue walking despite errors
		}

		if info.IsDir() {
			return nil
		}

		// Check if it's an audio file
		ext := strings.ToLower(filepath.Ext(path))
		if !audioExtensions[ext] {
			return nil
		}

		// Clean the path for consistent comparison
		cleanPath := filepath.Clean(path)

		// Check if it's tracked
		if !trackedPaths[cleanPath] {
			relPath, _ := filepath.Rel(musicDir, path)
			orphanedFiles = append(orphanedFiles, OrphanedFile{
				Path:         path,
				RelativePath: relPath,
				Size:         info.Size(),
			})
		}

		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("error walking music directory: %w", err)
	}

	log.Info().Int("orphaned_count", len(orphanedFiles)).Msg("Found orphaned files")
	return orphanedFiles, nil
}

// DeleteAlbum deletes an album and optionally its files
func DeleteAlbum(ctx context.Context, albumID int64, deleteFiles bool) error {
	query := fmt.Sprintf("id:%d", albumID)
	log.Info().Int64("album_id", albumID).Bool("delete_files", deleteFiles).Msg("Deleting album")

	args := []string{"remove", "-a"}
	if deleteFiles {
		args = append(args, "-d")
	}
	args = append(args, query)

	output, err := ExecBeetCommand(ctx, args[0], args[1:]...)
	if err != nil {
		log.Error().Err(err).Str("output", output).Msg("Failed to delete album")
		return fmt.Errorf("error deleting album: %w", err)
	}

	log.Info().Str("output", output).Msg("Album deleted successfully")
	return nil
}

// DeleteItem deletes an item/track and optionally its file
func DeleteItem(ctx context.Context, itemID int64, deleteFiles bool) error {
	query := fmt.Sprintf("id:%d", itemID)
	log.Info().Int64("item_id", itemID).Bool("delete_files", deleteFiles).Msg("Deleting item")

	args := []string{"remove"}
	if deleteFiles {
		args = append(args, "-d")
	}
	args = append(args, query)

	output, err := ExecBeetCommand(ctx, args[0], args[1:]...)
	if err != nil {
		log.Error().Err(err).Str("output", output).Msg("Failed to delete item")
		return fmt.Errorf("error deleting item: %w", err)
	}

	log.Info().Str("output", output).Msg("Item deleted successfully")
	return nil
}

// DeleteArtist deletes all albums by an artist and optionally their files
func DeleteArtist(ctx context.Context, artistName string, deleteFiles bool) error {
	// Sanitize artist name to prevent command injection
	sanitized, err := sanitizeBeetsQuery(artistName)
	if err != nil {
		return fmt.Errorf("invalid artist name: %w", err)
	}

	query := fmt.Sprintf("albumartist:%s", sanitized)
	log.Info().Str("artist", artistName).Bool("delete_files", deleteFiles).Msg("Deleting artist")

	args := []string{"remove", "-a"}
	if deleteFiles {
		args = append(args, "-d")
	}
	args = append(args, query)

	output, err := ExecBeetCommand(ctx, args[0], args[1:]...)
	if err != nil {
		log.Error().Err(err).Str("output", output).Msg("Failed to delete artist")
		return fmt.Errorf("error deleting artist: %w", err)
	}

	log.Info().Str("output", output).Msg("Artist deleted successfully")
	return nil
}

// ImportPath imports music files from a given path
func ImportPath(ctx context.Context, path string) error {
	// Validate path to prevent command injection
	if strings.Contains(path, ";") || strings.Contains(path, "|") ||
		strings.Contains(path, "&") || strings.Contains(path, "$") {
		return fmt.Errorf("invalid path: contains dangerous characters")
	}

	// Ensure path exists and is a directory
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("path does not exist: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("path is not a directory")
	}

	log.Info().Str("path", path).Msg("Importing music from path")

	// Use beet -v import -q --group-albums
	// -v: verbose logging (global flag)
	// import: import command
	// -q: quiet mode (non-interactive, uses quiet_fallback from config)
	// --group-albums: group tracks in folder into separate albums
	output, err := ExecBeetCommandWithFlags(ctx, []string{"-v"}, "import", "-q", "--group-albums", path)
	if err != nil {
		log.Error().Err(err).Str("output", output).Msg("Failed to import path")
		return fmt.Errorf("error importing path: %w", err)
	}

	log.Info().Str("output", output).Msg("Import completed successfully")
	return nil
}

// sanitizeBeetsQuery removes dangerous characters from beets query strings
func sanitizeBeetsQuery(query string) (string, error) {
	if len(query) > 1000 {
		return "", fmt.Errorf("query too long")
	}

	// Remove null bytes
	query = strings.ReplaceAll(query, "\x00", "")

	// Check for shell metacharacters that could cause command injection
	dangerous := []string{";", "|", "&", "$", "`", "\n", "\r", "$(", "${"}
	for _, char := range dangerous {
		if strings.Contains(query, char) {
			return "", fmt.Errorf("query contains dangerous characters: %s", char)
		}
	}

	return query, nil
}

// sanitizeMetadataValue sanitizes metadata field values
func sanitizeMetadataValue(value string) (string, error) {
	if len(value) > 10000 {
		return "", fmt.Errorf("value too long")
	}

	// Remove null bytes
	value = strings.ReplaceAll(value, "\x00", "")

	// Check for command injection patterns
	dangerous := []string{";", "|", "&", "$", "`", "$(", "${", "\n", "\r"}
	for _, char := range dangerous {
		if strings.Contains(value, char) {
			return "", fmt.Errorf("value contains dangerous characters: %s", char)
		}
	}

	return value, nil
}

// validateMetadataField ensures field name is safe (whitelist approach)
func validateMetadataField(field string) error {
	allowedFields := map[string]bool{
		"album":             true,
		"albumartist":       true,
		"artist":            true,
		"title":             true,
		"year":              true,
		"month":             true,
		"day":               true,
		"genre":             true,
		"genres":            true,
		"label":             true,
		"country":           true,
		"catalognum":        true,
		"barcode":           true,
		"albumtype":         true,
		"albumstatus":       true,
		"track":             true,
		"disc":              true,
		"comp":              true,
		"mb_albumid":        true,
		"mb_trackid":        true,
		"mb_releasegroupid": true,
	}

	if !allowedFields[field] {
		return fmt.Errorf("field not allowed: %s", field)
	}

	return nil
}
