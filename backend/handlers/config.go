package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"backend/beets"
)

// BeetsConfigHandler returns the beets configuration
func BeetsConfigHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		config, raw, err := beets.ParseBeetsConfig(ctx)
		if err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
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
}
