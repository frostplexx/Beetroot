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
	ID                 int64           `json:"id"`
	Title              string          `json:"title"`
	Artist             string          `json:"artist"`
	ArtistSort         string          `json:"artist_sort"`
	Album              string          `json:"album"`
	AlbumID            sql.NullInt64   `json:"album_id"`
	AlbumArtist        string          `json:"albumartist"`
	Path               string          `json:"path"`
	Length             float64         `json:"length"`
	Bitrate            int             `json:"bitrate"`
	Format             string          `json:"format"`
	Year               sql.NullInt64   `json:"year"`
	Month              sql.NullInt64   `json:"month"`
	Day                sql.NullInt64   `json:"day"`
	Track              sql.NullInt64   `json:"track"`
	TrackTotal         sql.NullInt64   `json:"tracktotal"`
	Disc               sql.NullInt64   `json:"disc"`
	DiscTotal          sql.NullInt64   `json:"disctotal"`
	Genres             sql.NullString  `json:"genres"`
	MusicBrainzTrackID sql.NullString  `json:"mb_trackid"`
	MusicBrainzAlbumID sql.NullString  `json:"mb_albumid"`
	Added              float64         `json:"added"`
	Modified           float64         `json:"mtime"`
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
	log.Info().Int64("album_id", albumID).Msg("Refetching album metadata")

	// Use beet update with -M flag to fetch from MusicBrainz
	_, err := ExecBeetCommand(ctx, "update", "-M", query)
	if err != nil {
		return fmt.Errorf("error refetching metadata: %w", err)
	}

	return nil
}

// RefetchAlbumArt refetches album art for an album
func RefetchAlbumArt(ctx context.Context, albumID int64) error {
	query := fmt.Sprintf("id:%d", albumID)
	log.Info().Int64("album_id", albumID).Msg("Refetching album art")

	// Use beet fetchart to fetch album art
	_, err := ExecBeetCommand(ctx, "fetchart", "-q", query)
	if err != nil {
		return fmt.Errorf("error refetching album art: %w", err)
	}

	return nil
}

// ModifyAlbumMetadata modifies album metadata
func ModifyAlbumMetadata(ctx context.Context, albumID int64, updates map[string]string) error {
	query := fmt.Sprintf("album_id:%d", albumID)

	// Build field=value arguments
	args := []string{query}
	for field, value := range updates {
		args = append(args, fmt.Sprintf("%s=%s", field, value))
	}

	log.Info().Int64("album_id", albumID).Interface("updates", updates).Msg("Modifying album metadata")

	_, err := ExecBeetCommand(ctx, "modify", append([]string{"-y"}, args...)...)
	if err != nil {
		return fmt.Errorf("error modifying metadata: %w", err)
	}

	return nil
}

// FindDuplicateAlbums finds potential duplicate albums
func FindDuplicateAlbums(ctx context.Context) ([]map[string]interface{}, error) {
	log.Debug().Msg("Finding duplicate albums")

	// Use keys to find albums with same artist and similar album name
	// This will catch split albums like "Album" and "Album (Deluxe Edition)"
	output, err := ExecBeetCommand(ctx, "duplicates", "-a", "-k", "albumartist", "-k", "album")
	if err != nil {
		return nil, fmt.Errorf("error finding duplicates: %w", err)
	}

	if output == "" {
		return []map[string]interface{}{}, nil
	}

	// Parse output - format is typically "Artist - Album"
	lines := strings.Split(strings.TrimSpace(output), "\n")
	duplicates := make([]map[string]interface{}, 0)

	for _, line := range lines {
		if line == "" {
			continue
		}
		duplicates = append(duplicates, map[string]interface{}{
			"info": line,
		})
	}

	return duplicates, nil
}

// MergeDuplicateAlbums merges duplicate albums
func MergeDuplicateAlbums(ctx context.Context, query string) error {
	log.Info().Str("query", query).Msg("Merging duplicate albums")

	_, err := ExecBeetCommand(ctx, "duplicates", "-a", "-M", query)
	if err != nil {
		return fmt.Errorf("error merging duplicates: %w", err)
	}

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
func (db *DB) GetDatabasePath(ctx context.Context) (string, error) {
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
		track, tracktotal, disc, disctotal, genres,
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
			&item.Genres, &item.MusicBrainzTrackID, &item.MusicBrainzAlbumID,
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
		track, tracktotal, disc, disctotal, genres,
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
		year, month, day, country, label, genres, disctotal,
		mb_albumid, mb_releasegroupid, added
	FROM albums WHERE id = ?`

	log.Debug().Int64("id", id).Msg("Querying album by ID")

	var album Album
	var artPathBytes []byte

	err := db.conn.QueryRowContext(ctx, query, id).Scan(
		&album.ID, &album.Album, &album.AlbumArtist, &album.AlbumArtistSort,
		&album.AlbumType, &artPathBytes, &album.Year, &album.Month, &album.Day,
		&album.Country, &album.Label, &album.Genres, &album.DiscTotal,
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
		track, tracktotal, disc, disctotal, genres,
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
			&item.Genres, &item.MusicBrainzTrackID, &item.MusicBrainzAlbumID,
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
			&item.Genres, &item.MusicBrainzTrackID, &item.MusicBrainzAlbumID,
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
	log.Info().Str("query", query).Bool("album", album).Msg("Applying ReplayGain")

	args := []string{}
	if album {
		args = append(args, "-a")
	}
	args = append(args, query)

	_, err := ExecBeetCommand(ctx, "replaygain", args...)
	if err != nil {
		return fmt.Errorf("error applying replaygain: %w", err)
	}

	return nil
}

// ModifyItemMetadata modifies track/item metadata
func ModifyItemMetadata(ctx context.Context, itemID int64, updates map[string]string) error {
	query := fmt.Sprintf("id:%d", itemID)

	// Build field=value arguments
	args := []string{query}
	for field, value := range updates {
		args = append(args, fmt.Sprintf("%s=%s", field, value))
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
