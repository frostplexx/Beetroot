package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"backend/beets"
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

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		album, err := db.GetAlbumByID(ctx, albumID)
		if err != nil {
			http.NotFound(w, r)
			return
		}

		// Get music directory from config
		config, _, err := beets.ParseBeetsConfig(ctx)
		if err != nil {
			http.Error(w, "Failed to get config", http.StatusInternalServerError)
			return
		}

		musicDir := config["directory"]
		if musicDir == "" {
			http.Error(w, "Music directory not configured", http.StatusInternalServerError)
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

		// Final validation before serving
		if err := validatePathWithinBase(musicDir, artPath); err != nil {
			http.Error(w, "Invalid file path", http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "public, max-age=2592000")
		w.Header().Set("ETag", etag)
		http.ServeFile(w, r, artPath)
	}
}
