package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"backend/beets"
	"backend/handlers"
	"backend/logger"
	"backend/middleware"

	zlog "github.com/rs/zerolog/log"
)

func main() {
	ctx := context.Background()

	// Initialize log buffer
	logger.InitGlobalBuffer(1000)

	// Add hook to capture logs in buffer
	hook := logger.NewBufferHook(logger.GetGlobalBuffer())
	zlog.Logger = zlog.Hook(hook)

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

	// Health endpoints
	mux.HandleFunc("/health", handlers.HealthHandler())
	mux.HandleFunc("/api/hello", handlers.APIHandler())

	// Config endpoint
	mux.HandleFunc("/api/beets/config", handlers.BeetsConfigHandler())

	// Album endpoints
	mux.HandleFunc("/api/beets/albums", handlers.AlbumsHandler(db))
	mux.HandleFunc("/api/beets/albums/count", handlers.AlbumsCountHandler(db))
	mux.HandleFunc("/api/beets/albums/by-id/", handlers.GetAlbumByIDHandler(db))
	mux.HandleFunc("/api/beets/albums/", handlers.AlbumArtHandler(db))

	// Item endpoints
	mux.HandleFunc("/api/beets/items", handlers.ItemsHandler(db))
	mux.HandleFunc("/api/beets/items/count", handlers.ItemsCountHandler(db))
	mux.HandleFunc("/api/beets/items/by-album/", handlers.ItemsByAlbumHandler(db))
	mux.HandleFunc("/api/beets/items/", handlers.StreamAudioHandler(db))

	// Search endpoints
	mux.HandleFunc("/api/beets/search/albums", handlers.SearchAlbumsHandler(db))
	mux.HandleFunc("/api/beets/search/items", handlers.SearchItemsHandler(db))

	// Stats endpoint
	mux.HandleFunc("/api/beets/stats", handlers.StatsHandler(db))

	// Metadata endpoints
	mux.HandleFunc("/api/beets/refetch", handlers.RefetchMetadataHandler())
	mux.HandleFunc("/api/beets/refetch-art", handlers.RefetchArtHandler())
	mux.HandleFunc("/api/beets/modify", handlers.ModifyMetadataHandler())
	mux.HandleFunc("/api/beets/modify-item", handlers.ModifyItemHandler())
	mux.HandleFunc("/api/beets/mb-recommendations", handlers.GetMusicBrainzRecommendationsHandler(db))

	// Delete endpoints
	mux.HandleFunc("/api/beets/delete/album", handlers.DeleteAlbumHandler())
	mux.HandleFunc("/api/beets/delete/item", handlers.DeleteItemHandler())
	mux.HandleFunc("/api/beets/delete/artist", handlers.DeleteArtistHandler())

	// Tool endpoints
	mux.HandleFunc("/api/beets/duplicates", handlers.DuplicatesHandler())
	mux.HandleFunc("/api/beets/duplicates/merge", handlers.MergeDuplicatesHandler())
	mux.HandleFunc("/api/beets/tools/missing-art", handlers.MissingArtHandler(db))
	mux.HandleFunc("/api/beets/tools/fetch-art", handlers.FetchArtHandler())
	mux.HandleFunc("/api/beets/tools/replaygain", handlers.ReplayGainHandler())
	mux.HandleFunc("/api/beets/fetch-lyrics", handlers.FetchLyricsHandler())

	// Upload & Import endpoints
	mux.HandleFunc("/api/beets/upload", handlers.UploadHandler())
	mux.HandleFunc("/api/beets/import", handlers.ImportHandler())

	// Logs endpoints
	mux.HandleFunc("/api/logs", handlers.LogsHandler())
	mux.HandleFunc("/api/logs/clear", handlers.ClearLogsHandler())

	if frontendDistDir := os.Getenv("FRONTEND_DIST_DIR"); frontendDistDir != "" {
		mux.Handle("/", handlers.FrontendHandler(frontendDistDir))
	}

	// Apply middleware
	handler := middleware.EnableCORS(mux)

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
