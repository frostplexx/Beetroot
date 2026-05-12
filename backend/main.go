package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"backend/beets"
)

type Response struct {
	Message string `json:"message"`
	Status  string `json:"status"`
}

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(Response{
		Message: "Backend is running!",
		Status:  "ok",
	})
}

func apiHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(Response{
		Message: "Hello from Go backend!",
		Status:  "success",
	})
}

func beetsConfigHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	config, raw, err := beets.ParseBeetsConfig(ctx)
	if err != nil {
		w.WriteHeader(http.StatusOK) // Return 200 so the frontend can handle the error data
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":      err.Error(),
			"raw_config": raw,
			"is_valid":   false,
		})
		return
	}

	response := map[string]interface{}{
		"config":   config,
		"is_valid": true,
	}
	json.NewEncoder(w).Encode(response)
}

func main() {
	ctx := context.Background()

	// Initialize database connection
	dbPath, err := beets.GetDatabasePath(ctx)
	if err != nil {
		log.Printf("Warning: Could not get database path: %v", err)
		log.Printf("Database features will be unavailable")
	}

	var db *beets.DB
	if dbPath != "" {
		db, err = beets.OpenDB(ctx, dbPath)
		if err != nil {
			log.Printf("Warning: Could not open database: %v", err)
			log.Printf("Database features will be unavailable")
		} else {
			defer db.Close()
		}
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/api/hello", apiHandler)
	mux.HandleFunc("/api/beets/config", beetsConfigHandler)

	// Database endpoints
	mux.HandleFunc("/api/beets/albums", makeAlbumsHandler(db))
	mux.HandleFunc("/api/beets/items", makeItemsHandler(db))
	mux.HandleFunc("/api/beets/stats", makeStatsHandler(db))
	mux.HandleFunc("/api/beets/search/albums", makeSearchAlbumsHandler(db))
	mux.HandleFunc("/api/beets/search/items", makeSearchItemsHandler(db))

	// Metadata tools
	mux.HandleFunc("/api/beets/refetch", makeRefetchMetadataHandler())
	mux.HandleFunc("/api/beets/refetch-art", makeRefetchArtHandler())
	mux.HandleFunc("/api/beets/modify", makeModifyMetadataHandler())
	mux.HandleFunc("/api/beets/modify-item", makeModifyItemHandler())
	mux.HandleFunc("/api/beets/fetch-lyrics", makeFetchLyricsHandler())
	mux.HandleFunc("/api/beets/duplicates", makeDuplicatesHandler())
	mux.HandleFunc("/api/beets/duplicates/merge", makeMergeDuplicatesHandler())

	mux.HandleFunc("/api/beets/albums/", makeAlbumArtHandler(db))
	mux.HandleFunc("/api/beets/items/", makeStreamAudioHandler(db))

	// Tool endpoints
	mux.HandleFunc("/api/beets/tools/missing-art", makeMissingArtHandler(db))
	mux.HandleFunc("/api/beets/tools/fetch-art", makeFetchArtHandler())
	mux.HandleFunc("/api/beets/tools/replaygain", makeReplayGainHandler())

	handler := enableCORS(mux)

	port := os.Getenv("PORT")
	if port == "" {
		port = "4433"
	}

	log.Printf("--------------------------------------------------")
	log.Printf("🚀 Beetroot Backend Starting")
	log.Printf("📡 Port: %s", port)
	if db != nil {
		log.Printf("📂 Database: %s (CONNECTED)", dbPath)
	} else {
		log.Printf("⚠️  Database: NOT CONNECTED (Features will be limited)")
	}
	log.Printf("--------------------------------------------------")

	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal(err)
	}
}

func makeAlbumsHandler(db *beets.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if db == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Database connection is not available. Please check your beets configuration.",
			})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		albums, err := db.GetAlbums(ctx, beets.QueryOptions{})
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

func makeItemsHandler(db *beets.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if db == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Database connection is not available. Please check your beets configuration.",
			})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		items, err := db.GetItems(ctx, beets.QueryOptions{})
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

func makeStatsHandler(db *beets.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if db == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Database connection is not available. Please check your beets configuration.",
			})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		stats, err := db.GetStats(ctx)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": err.Error(),
			})
			return
		}

		json.NewEncoder(w).Encode(stats)
	}
}

func makeSearchAlbumsHandler(db *beets.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if db == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Database connection is not available. Please check your beets configuration.",
			})
			return
		}

		query := r.URL.Query().Get("q")

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		// Use beets query for full query syntax support
		albums, err := db.QueryAlbums(ctx, query)
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

func makeSearchItemsHandler(db *beets.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if db == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Database connection is not available. Please check your beets configuration.",
			})
			return
		}

		query := r.URL.Query().Get("q")

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		// Use beets query for full query syntax support
		items, err := db.QueryItems(ctx, query)
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

func makeRefetchMetadataHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		var req struct {
			AlbumID int64 `json:"album_id"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()

		if err := beets.RefetchAlbumMetadata(ctx, req.AlbumID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

func makeRefetchArtHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		var req struct {
			AlbumID int64 `json:"album_id"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()

		if err := beets.RefetchAlbumArt(ctx, req.AlbumID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

func makeModifyMetadataHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		var req struct {
			AlbumID int64             `json:"album_id"`
			Updates map[string]string `json:"updates"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		if err := beets.ModifyAlbumMetadata(ctx, req.AlbumID, req.Updates); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

func makeDuplicatesHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		duplicates, err := beets.FindDuplicateAlbums(ctx)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		json.NewEncoder(w).Encode(duplicates)
	}
}

func makeMergeDuplicatesHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		var req struct {
			Query string `json:"query"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()

		if err := beets.MergeDuplicateAlbums(ctx, req.Query); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

func makeAlbumArtHandler(db *beets.DB) http.HandlerFunc {
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
			// If it's a relative path, make it absolute
			if !filepath.IsAbs(testPath) {
				testPath = filepath.Join(musicDir, testPath)
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

			// Get album directory from first item's path (relative to music dir)
			itemPath := items[0].Path
			// Make absolute path
			if !filepath.IsAbs(itemPath) {
				itemPath = filepath.Join(musicDir, itemPath)
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

		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "public, max-age=604800, immutable")
		w.Header().Set("ETag", fmt.Sprintf(`"%d-%d"`, albumID, time.Now().Unix()/86400))
		http.ServeFile(w, r, artPath)
	}
}

func makeMissingArtHandler(db *beets.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if db == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Database connection is not available. Please check your beets configuration.",
			})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		albums, err := db.GetAlbumsWithoutArt(ctx)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		json.NewEncoder(w).Encode(albums)
	}
}

func makeFetchArtHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		var req struct {
			AlbumID int64 `json:"album_id"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()

		if err := beets.FetchArtForAlbum(ctx, req.AlbumID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

func makeReplayGainHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		var req struct {
			Query string `json:"query"`
			Album bool   `json:"album"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
		defer cancel()

		if err := beets.ApplyReplayGain(ctx, req.Query, req.Album); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

func makeModifyItemHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		var req struct {
			ItemID  int64             `json:"item_id"`
			Updates map[string]string `json:"updates"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		if err := beets.ModifyItemMetadata(ctx, req.ItemID, req.Updates); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

func makeFetchLyricsHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		var req struct {
			ItemID int64 `json:"item_id"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		if err := beets.FetchLyricsForItem(ctx, req.ItemID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

func makeStreamAudioHandler(db *beets.DB) http.HandlerFunc {
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
		audioPath := item.Path
		if !filepath.IsAbs(audioPath) {
			audioPath = filepath.Join(musicDir, audioPath)
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
