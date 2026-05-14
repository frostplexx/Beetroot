package handlers

import (
	"context"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"backend/beets"

	"golang.org/x/image/draw"
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

// resizeImage resizes an image to fit within maxWidth x maxHeight while maintaining aspect ratio
func resizeImage(img image.Image, maxWidth, maxHeight int) image.Image {
	bounds := img.Bounds()
	width, height := bounds.Dx(), bounds.Dy()

	// Calculate scaling factor
	scaleX := float64(maxWidth) / float64(width)
	scaleY := float64(maxHeight) / float64(height)
	scale := scaleX
	if scaleY < scaleX {
		scale = scaleY
	}

	// Don't upscale
	if scale >= 1.0 {
		return img
	}

	newWidth := int(float64(width) * scale)
	newHeight := int(float64(height) * scale)

	dst := image.NewRGBA(image.Rect(0, 0, newWidth, newHeight))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, img.Bounds(), draw.Over, nil)
	return dst
}

// getThumbnailPath returns a cached thumbnail path
func getThumbnailPath(artPath string, size int) string {
	hash := fmt.Sprintf("%x", md5.Sum([]byte(artPath)))
	cacheDir := filepath.Join(os.TempDir(), "beetroot-thumbs")
	os.MkdirAll(cacheDir, 0755)
	return filepath.Join(cacheDir, fmt.Sprintf("%s-%d.jpg", hash, size))
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

	// If thumbnail requested, resize and serve
	if thumbnailSize > 0 {
		thumbPath := getThumbnailPath(artPath, thumbnailSize)

		// Check if thumbnail exists and is newer than original
		if thumbInfo, err := os.Stat(thumbPath); err == nil {
			if thumbInfo.ModTime().After(fileInfo.ModTime()) {
				w.Header().Set("Content-Type", "image/jpeg")
				w.Header().Set("Cache-Control", "public, max-age=2592000")
				w.Header().Set("ETag", etag)
				http.ServeFile(w, r, thumbPath)
				return
			}
		}

		// Generate thumbnail
		srcFile, err := os.Open(artPath)
		if err != nil {
			http.Error(w, "Failed to open image", http.StatusInternalServerError)
			return
		}
		defer srcFile.Close()

		var img image.Image
		ext := strings.ToLower(filepath.Ext(artPath))
		switch ext {
		case ".jpg", ".jpeg":
			img, err = jpeg.Decode(srcFile)
		case ".png":
			img, err = png.Decode(srcFile)
		default:
			// For unsupported formats, serve original
			w.Header().Set("Content-Type", contentType)
			w.Header().Set("Cache-Control", "public, max-age=2592000")
			w.Header().Set("ETag", etag)
			http.ServeFile(w, r, artPath)
			return
		}

		if err != nil {
			// If decode fails, serve original
			w.Header().Set("Content-Type", contentType)
			w.Header().Set("Cache-Control", "public, max-age=2592000")
			w.Header().Set("ETag", etag)
			http.ServeFile(w, r, artPath)
			return
		}

		// Resize image
		resized := resizeImage(img, thumbnailSize, thumbnailSize)

		// Save thumbnail to cache
		thumbFile, err := os.Create(thumbPath)
		if err == nil {
			defer thumbFile.Close()
			jpeg.Encode(thumbFile, resized, &jpeg.Options{Quality: 85})
		}

		// Serve resized image
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "public, max-age=2592000")
		w.Header().Set("ETag", etag)
		jpeg.Encode(w, resized, &jpeg.Options{Quality: 85})
		return
	}

	// Serve original image
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=2592000")
	w.Header().Set("ETag", etag)
	http.ServeFile(w, r, artPath)
}
