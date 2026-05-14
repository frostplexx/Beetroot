package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"backend/beets"
)

// ItemsHandler returns paginated list of items/tracks
func ItemsHandler(db *beets.DB) http.HandlerFunc {
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
		limit := 100 // default page size
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

		items, err := db.GetItems(ctx, beets.QueryOptions{
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

		json.NewEncoder(w).Encode(items)
	}
}

// ItemsCountHandler returns total count of items
func ItemsCountHandler(db *beets.DB) http.HandlerFunc {
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

		count, err := db.GetItemsCount(ctx)
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

// ItemsByAlbumHandler returns all items for a specific album
func ItemsByAlbumHandler(db *beets.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if db == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Database connection is not available. Please check your beets configuration.",
			})
			return
		}

		// Extract album ID from URL path: /api/beets/items/by-album/{id}
		path := strings.TrimPrefix(r.URL.Path, "/api/beets/items/by-album/")
		albumID, err := strconv.ParseInt(path, 10, 64)
		if err != nil {
			http.Error(w, "Invalid album ID", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		items, err := db.GetItemsByAlbumID(ctx, albumID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": err.Error(),
			})
			return
		}

		json.NewEncoder(w).Encode(items)
	}
}

// StreamAudioHandler streams audio files
func StreamAudioHandler(db *beets.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if db == nil {
			http.Error(w, "Database connection not available", http.StatusServiceUnavailable)
			return
		}

		// Extract item ID from URL path: /api/beets/items/{id}/stream
		path := strings.TrimPrefix(r.URL.Path, "/api/beets/items/")
		parts := strings.Split(path, "/")
		if len(parts) < 2 || parts[1] != "stream" {
			http.NotFound(w, r)
			return
		}

		itemIDStr := parts[0]
		itemID, err := strconv.ParseInt(itemIDStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid item ID", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		item, err := db.GetItemByID(ctx, itemID)
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

		// Build absolute path to audio file
		audioPath := filepath.Clean(item.Path)
		if !filepath.IsAbs(audioPath) {
			audioPath = filepath.Join(musicDir, audioPath)
		}

		// Validate that the path is within the music directory
		if err := validatePathWithinBase(musicDir, audioPath); err != nil {
			http.Error(w, "Invalid file path", http.StatusBadRequest)
			return
		}

		if _, err := os.Stat(audioPath); os.IsNotExist(err) {
			http.NotFound(w, r)
			return
		}

		// Set content type based on format
		contentType := "audio/mpeg"
		switch strings.ToLower(item.Format) {
		case "mp3":
			contentType = "audio/mpeg"
		case "flac":
			contentType = "audio/flac"
		case "m4a", "aac":
			contentType = "audio/mp4"
		case "ogg":
			contentType = "audio/ogg"
		case "wav":
			contentType = "audio/wav"
		}

		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Accept-Ranges", "bytes")
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		http.ServeFile(w, r, audioPath)
	}
}
