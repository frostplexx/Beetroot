package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"backend/beets"
)

// SearchAlbumsHandler searches albums using beets query syntax
func SearchAlbumsHandler(db *beets.DB) http.HandlerFunc {
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

// SearchItemsHandler searches items using beets query syntax
func SearchItemsHandler(db *beets.DB) http.HandlerFunc {
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
