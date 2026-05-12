package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"backend/logger"
)

// LogsHandler returns recent log entries
func LogsHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Get limit from query parameter (default 500)
		limit := 500
		if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
			if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 {
				limit = parsedLimit
			}
		}

		// Get logs from buffer
		logs := logger.GetGlobalBuffer().GetRecent(limit)

		// Return as JSON
		json.NewEncoder(w).Encode(map[string]interface{}{
			"logs":  logs,
			"count": len(logs),
		})
	}
}

// ClearLogsHandler clears the log buffer
func ClearLogsHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		logger.GetGlobalBuffer().Clear()

		json.NewEncoder(w).Encode(map[string]string{
			"status": "success",
			"message": "Logs cleared",
		})
	}
}
