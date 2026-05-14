package handlers

import (
	"context"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"backend/beets"

	"github.com/disintegration/imaging"
)

// Album art path cache with expiration
type artCacheEntry struct {
	path      string
	timestamp time.Time
}

type configCacheEntry struct {
	musicDir  string
	timestamp time.Time
}

var (
	artCache      = sync.Map{}
	artCacheTTL   = 5 * time.Minute
	configCache   *configCacheEntry
	configCacheMu sync.RWMutex
	configCacheTTL = 1 * time.Minute
)

// AlbumsHandler returns paginated list of albums
func AlbumsHandler(db *beets.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if db == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Database connection is not available. Please check your beets configuration.",
			})
			return
		}

		// Parse pagination parameters
		limit := 50 // default page size
		offset := 0

		if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
			if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 {
				limit = parsedLimit
			}
		}

		if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
			if parsedOffset, err := strconv.Atoi(offsetStr); err == nil && parsedOffset >= 0 {
				offset = parsedOffset
			}
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		albums, err := db.GetAlbums(ctx, beets.QueryOptions{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": err.Error(),
			})
			return
		}

		json.NewEncoder(w).Encode(albums)
	}
}

// AlbumsCountHandler returns total count of albums
func AlbumsCountHandler(db *beets.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if db == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Database connection is not available. Please check your beets configuration.",
			})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		count, err := db.GetAlbumsCount(ctx)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": err.Error(),
			})
			return
		}

		json.NewEncoder(w).Encode(map[string]int64{"count": count})
	}
}

// GetAlbumByIDHandler returns a single album by ID
func GetAlbumByIDHandler(db *beets.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if db == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Database connection is not available. Please check your beets configuration.",
			})
			return
		}

		// Extract album ID from URL path: /api/beets/albums/by-id/{id}
		path := strings.TrimPrefix(r.URL.Path, "/api/beets/albums/by-id/")
		albumID, err := strconv.ParseInt(path, 10, 64)
		if err != nil {
			http.Error(w, "Invalid album ID", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		album, err := db.GetAlbumByID(ctx, albumID)
		if err != nil {
			http.NotFound(w, r)
			return
		}

		json.NewEncoder(w).Encode(album)
	}
}

// AlbumArtHandler serves album artwork
func AlbumArtHandler(db *beets.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if db == nil {
			http.Error(w, "Database connection not available", http.StatusServiceUnavailable)
			return
		}

		// Extract album ID from URL path: /api/beets/albums/{id}/art
		path := strings.TrimPrefix(r.URL.Path, "/api/beets/albums/")
		parts := strings.Split(path, "/")
		if len(parts) < 2 || parts[1] != "art" {
			http.NotFound(w, r)
			return
		}

		albumIDStr := parts[0]
		albumID, err := strconv.ParseInt(albumIDStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid album ID", http.StatusBadRequest)
			return
		}

		// Check cache first
		if cached, ok := artCache.Load(albumID); ok {
			entry := cached.(artCacheEntry)
			if time.Since(entry.timestamp) < artCacheTTL {
				// Cache hit - serve directly
				if _, err := os.Stat(entry.path); err == nil {
					serveAlbumArt(w, r, entry.path, albumID)
					return
				}
				// File no longer exists, remove from cache
				artCache.Delete(albumID)
			}
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		album, err := db.GetAlbumByID(ctx, albumID)
		if err != nil {
			http.NotFound(w, r)
			return
		}

		// Get music directory from config (cached)
		musicDir, err := getMusicDirectory(ctx)
		if err != nil {
			http.Error(w, "Failed to get music directory: "+err.Error(), http.StatusInternalServerError)
			return
		}

		var artPath string

		// First, try the artpath from the database
		if album.ArtPath.Valid && album.ArtPath.String != "" {
			testPath := album.ArtPath.String

			// Sanitize path to prevent directory traversal
			testPath = filepath.Clean(testPath)

			// If it's a relative path, make it absolute
			if !filepath.IsAbs(testPath) {
				testPath = filepath.Join(musicDir, testPath)
			}

			// Validate that the path is within the music directory
			if err := validatePathWithinBase(musicDir, testPath); err != nil {
				http.Error(w, "Invalid art path", http.StatusBadRequest)
				return
			}

			if _, err := os.Stat(testPath); err == nil {
				artPath = testPath
			}
		}

		// If no artpath or file doesn't exist, look for cover art in album directory
		if artPath == "" {
			items, err := db.GetItemsByAlbumID(ctx, albumID)
			if err != nil || len(items) == 0 {
				http.NotFound(w, r)
				return
			}

			// Get album directory from first item's path
			itemPath := filepath.Clean(items[0].Path)
			if !filepath.IsAbs(itemPath) {
				itemPath = filepath.Join(musicDir, itemPath)
			}

			// Validate that the path is within the music directory
			if err := validatePathWithinBase(musicDir, itemPath); err != nil {
				http.NotFound(w, r)
				return
			}

			albumDir := filepath.Dir(itemPath)

			// Common cover art filenames
			coverNames := []string{
				"cover.jpg", "cover.jpeg", "cover.png",
				"folder.jpg", "folder.jpeg", "folder.png",
				"front.jpg", "front.jpeg", "front.png",
				"album.jpg", "album.jpeg", "album.png",
				"Cover.jpg", "Cover.jpeg", "Cover.png",
				"Folder.jpg", "Folder.jpeg", "Folder.png",
			}

			for _, coverName := range coverNames {
				testPath := filepath.Join(albumDir, coverName)
				if _, err := os.Stat(testPath); err == nil {
					artPath = testPath
					break
				}
			}
		}

		if artPath == "" {
			http.NotFound(w, r)
			return
		}

		// Cache the resolved path
		artCache.Store(albumID, artCacheEntry{
			path:      artPath,
			timestamp: time.Now(),
		})

		// Serve the file
		serveAlbumArt(w, r, artPath, albumID)
	}
}

// getMusicDirectory gets the music directory from config with caching
func getMusicDirectory(ctx context.Context) (string, error) {
	configCacheMu.RLock()
	if configCache != nil && time.Since(configCache.timestamp) < configCacheTTL {
		musicDir := configCache.musicDir
		configCacheMu.RUnlock()
		return musicDir, nil
	}
	configCacheMu.RUnlock()

	// Cache miss or expired, refresh
	config, _, err := beets.ParseBeetsConfig(ctx)
	if err != nil {
		return "", err
	}

	musicDir := config["directory"]
	if musicDir == "" {
		return "", fmt.Errorf("music directory not configured")
	}

	configCacheMu.Lock()
	configCache = &configCacheEntry{
		musicDir:  musicDir,
		timestamp: time.Now(),
	}
	configCacheMu.Unlock()

	return musicDir, nil
}

// getThumbnailPath returns a cached thumbnail path
func getThumbnailPath(artPath string, size int) string {
	hash := fmt.Sprintf("%x", md5.Sum([]byte(artPath)))
	cacheDir := filepath.Join(os.TempDir(), "beetroot-thumbs")
	os.MkdirAll(cacheDir, 0755)
	return filepath.Join(cacheDir, fmt.Sprintf("%s-%d.webp", hash, size))
}

// ClearThumbnailCache clears cached thumbnails for a specific art path
func ClearThumbnailCache(artPath string) {
	hash := fmt.Sprintf("%x", md5.Sum([]byte(artPath)))
	cacheDir := filepath.Join(os.TempDir(), "beetroot-thumbs")

	// Remove all cached sizes for this image
	pattern := filepath.Join(cacheDir, fmt.Sprintf("%s-*", hash))
	matches, err := filepath.Glob(pattern)
	if err == nil {
		for _, match := range matches {
			os.Remove(match)
		}
	}

	// Also clear from in-memory cache by removing all entries
	// This is a simple approach - clear all cache entries
	artCache = sync.Map{}
}

// convertToWebP converts an image to WebP using ImageMagick
func convertToWebP(inputPath, outputPath string, size int) error {
	// Use ImageMagick to resize and convert to WebP
	cmd := exec.Command("magick", "convert",
		inputPath,
		"-resize", fmt.Sprintf("%dx%d>", size, size), // > means only shrink, don't enlarge
		"-quality", "85",
		"-define", "webp:method=6", // Best compression
		outputPath,
	)
	return cmd.Run()
}

// serveAlbumArt serves an album art file with proper headers and caching
func serveAlbumArt(w http.ResponseWriter, r *http.Request, artPath string, albumID int64) {
	// Check for size parameter (for thumbnails)
	sizeStr := r.URL.Query().Get("size")
	var thumbnailSize int
	if sizeStr != "" {
		if size, err := strconv.Atoi(sizeStr); err == nil && size > 0 && size <= 2000 {
			thumbnailSize = size
		}
	}
	// Get file info for modification time
	fileInfo, err := os.Stat(artPath)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	// Generate ETag based on album ID and file modification time
	etag := fmt.Sprintf(`"%d-%d"`, albumID, fileInfo.ModTime().Unix())

	// Check If-None-Match header for conditional requests
	if match := r.Header.Get("If-None-Match"); match != "" {
		if match == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
	}

	// Determine content type based on file extension
	ext := strings.ToLower(filepath.Ext(artPath))
	contentType := "application/octet-stream"
	switch ext {
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	case ".png":
		contentType = "image/png"
	case ".gif":
		contentType = "image/gif"
	case ".webp":
		contentType = "image/webp"
	}

	// If thumbnail requested, resize and serve as WebP
	if thumbnailSize > 0 {
		thumbPath := getThumbnailPath(artPath, thumbnailSize)

		// Check if thumbnail exists and is newer than original
		if thumbInfo, err := os.Stat(thumbPath); err == nil {
			if thumbInfo.ModTime().After(fileInfo.ModTime()) {
				w.Header().Set("Content-Type", "image/webp")
				w.Header().Set("Cache-Control", "public, max-age=2592000")
				w.Header().Set("ETag", etag)
				http.ServeFile(w, r, thumbPath)
				return
			}
		}

		// Try ImageMagick conversion first (best quality WebP)
		err := convertToWebP(artPath, thumbPath, thumbnailSize)
		if err == nil {
			// Success - serve the WebP thumbnail
			w.Header().Set("Content-Type", "image/webp")
			w.Header().Set("Cache-Control", "public, max-age=2592000")
			w.Header().Set("ETag", etag)
			http.ServeFile(w, r, thumbPath)
			return
		}

		// Fallback: Use imaging library if ImageMagick fails
		img, err := imaging.Open(artPath)
		if err != nil {
			// If decode fails, serve original
			w.Header().Set("Content-Type", contentType)
			w.Header().Set("Cache-Control", "public, max-age=2592000")
			w.Header().Set("ETag", etag)
			http.ServeFile(w, r, artPath)
			return
		}

		// Resize image (Lanczos filter for best quality)
		resized := imaging.Fit(img, thumbnailSize, thumbnailSize, imaging.Lanczos)

		// Save as JPEG fallback (change extension)
		jpegPath := strings.TrimSuffix(thumbPath, ".webp") + ".jpg"
		err = imaging.Save(resized, jpegPath, imaging.JPEGQuality(85))
		if err != nil {
			// If save fails, serve resized image directly
			w.Header().Set("Content-Type", "image/jpeg")
			w.Header().Set("Cache-Control", "public, max-age=2592000")
			w.Header().Set("ETag", etag)
			imaging.Encode(w, resized, imaging.JPEG)
			return
		}

		// Serve JPEG fallback
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "public, max-age=2592000")
		w.Header().Set("ETag", etag)
		http.ServeFile(w, r, jpegPath)
		return
	}

	// Serve original image
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=2592000")
	w.Header().Set("ETag", etag)
	http.ServeFile(w, r, artPath)
}
