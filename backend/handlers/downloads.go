package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"backend/extensions"
)

// SearchHandler searches across all enabled extensions
func SearchHandler(searchService *extensions.SearchService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Parse request
		var req struct {
			Query string   `json:"query"`
			Types []string `json:"types"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
			return
		}

		if req.Query == "" {
			http.Error(w, "Query is required", http.StatusBadRequest)
			return
		}

		// Default types if not specified
		if len(req.Types) == 0 {
			req.Types = []string{"track", "album"}
		}

		// Search
		results, err := searchService.Search(r.Context(), req.Query, req.Types)
		if err != nil {
			http.Error(w, fmt.Sprintf("Search failed: %v", err), http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": results,
			"count":   len(results),
		})
	}
}

// QueueDownloadHandler adds a download to the queue
func QueueDownloadHandler(downloadService *extensions.DownloadService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Parse request
		var req struct {
			SearchResult extensions.SearchResult `json:"search_result"`
			AutoImport   bool                     `json:"auto_import"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
			return
		}

		// Queue download
		id, err := downloadService.QueueDownload(req.SearchResult, req.AutoImport)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to queue download: %v", err), http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"id":      id,
		})
	}
}

// GetDownloadQueueHandler returns the download queue
func GetDownloadQueueHandler(downloadService *extensions.DownloadService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		queue, err := downloadService.GetQueue()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to get queue: %v", err), http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"queue": queue,
		})
	}
}

// CancelDownloadHandler cancels a download
func CancelDownloadHandler(downloadService *extensions.DownloadService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method != http.MethodDelete {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract ID from path
		pathParts := strings.Split(r.URL.Path, "/")
		if len(pathParts) < 4 {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}
		idStr := pathParts[3]
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid download ID", http.StatusBadRequest)
			return
		}

		// Cancel download
		if err := downloadService.CancelDownload(id); err != nil {
			http.Error(w, fmt.Sprintf("Failed to cancel download: %v", err), http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
	}
}
