package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"backend/beets"
	"backend/extensions"
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

	// Initialize audit logger
	auditDBPath := os.Getenv("AUDIT_DB_PATH")
	if auditDBPath == "" {
		auditDBPath = "./audit.db"
	}
	if err := handlers.InitAuditLogger(auditDBPath); err != nil {
		log.Printf("Warning: Could not initialize audit logger: %v", err)
		log.Printf("Audit logging will be unavailable")
	} else {
		log.Printf("Audit logging initialized at %s", auditDBPath)
	}

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
	mux.HandleFunc("/api/beets/mb-recommendations", handlers.GetMetadataRecommendationsHandler(db))
	mux.HandleFunc("/api/beets/mb-tracklist", handlers.GetCompleteTracklistHandler(db))
	mux.HandleFunc("/api/beets/mb-search", handlers.SearchMusicBrainzHandler())

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
	mux.HandleFunc("/api/beets/tools/orphaned-files", handlers.OrphanedFilesHandler(db))
	mux.HandleFunc("/api/beets/fetch-lyrics", handlers.FetchLyricsHandler())

	// Upload & Import endpoints
	mux.HandleFunc("/api/beets/upload", handlers.UploadHandler())
	mux.HandleFunc("/api/beets/import", handlers.ImportHandler())

	// Logs endpoints
	mux.HandleFunc("/api/logs", handlers.LogsHandler())
	mux.HandleFunc("/api/logs/clear", handlers.ClearLogsHandler())

	// Audit endpoints
	mux.HandleFunc("/api/audit/logs", handlers.AuditLogsHandler())
	mux.HandleFunc("/api/audit/logs/target", handlers.AuditLogsByTargetHandler())
	mux.HandleFunc("/api/audit/stats", handlers.AuditStatsHandler())

	// Initialize extension system
	extensionDBPath := os.Getenv("EXTENSION_DB_PATH")
	if extensionDBPath == "" {
		extensionDBPath = "./extensions.db"
	}
	extDB, err := extensions.NewExtensionDB(extensionDBPath)
	if err != nil {
		log.Printf("Warning: Could not initialize extensions: %v", err)
		log.Printf("Extension features will be unavailable")
	} else {
		defer extDB.Close()
		log.Printf("Extensions initialized at %s", extensionDBPath)

		// Initialize search and download services
		searchService := extensions.NewSearchService(extDB)
		downloadService := extensions.NewDownloadService(extDB, searchService, "./tmp/beetroot-downloads")

		// Start download worker
		worker := extensions.NewDownloadWorker(downloadService)
		worker.Start()
		defer worker.Stop()

		// Extension endpoints
		mux.HandleFunc("/api/extensions", handlers.ListExtensionsHandler(extDB))
		mux.HandleFunc("/api/extensions/install", handlers.InstallExtensionHandler(extDB))
		mux.HandleFunc("/api/extensions/install-from-registry", handlers.InstallFromRegistryHandler(extDB))
		mux.HandleFunc("/api/extensions/registry", handlers.GetRegistryHandler())

		// Search and download endpoints
		mux.HandleFunc("/api/extensions/search", handlers.SearchHandler(searchService))
		mux.HandleFunc("/api/downloads/queue", func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet {
				handlers.GetDownloadQueueHandler(downloadService)(w, r)
			} else if r.Method == http.MethodPost {
				handlers.QueueDownloadHandler(downloadService)(w, r)
			} else {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			}
		})

		// Extension detail endpoints (handle both /api/extensions/{id} and /api/extensions/{id}/settings, etc.)
		mux.HandleFunc("/api/extensions/", func(w http.ResponseWriter, r *http.Request) {
			path := r.URL.Path
			if path == "/api/extensions/" {
				handlers.ListExtensionsHandler(extDB)(w, r)
				return
			}

			// Check for specific actions
			if r.Method == http.MethodPut {
				if contains(path, "/settings") {
					handlers.UpdateExtensionSettingsHandler(extDB)(w, r)
					return
				}
				if contains(path, "/enable") {
					handlers.EnableExtensionHandler(extDB)(w, r)
					return
				}
			}

			if r.Method == http.MethodDelete {
				handlers.UninstallExtensionHandler(extDB)(w, r)
				return
			}

			if r.Method == http.MethodGet {
				handlers.GetExtensionHandler(extDB)(w, r)
				return
			}

			http.Error(w, "Not found", http.StatusNotFound)
		})

		// Download cancel endpoint
		mux.HandleFunc("/api/downloads/", func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodDelete {
				handlers.CancelDownloadHandler(downloadService)(w, r)
			} else {
				http.Error(w, "Not found", http.StatusNotFound)
			}
		})
	}

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

// Helper function to check if string contains substring
func contains(s, substr string) bool {
	return len(s) >= len(substr) && s[len(s)-len(substr):] == substr ||
		   (len(s) > len(substr) && s[len(s)-len(substr)-1:len(s)-1] == substr)
}
