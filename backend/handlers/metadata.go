package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"backend/beets"
)

// RefetchMetadataHandler refetches album metadata from MusicBrainz
func RefetchMetadataHandler() http.HandlerFunc {
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

// RefetchArtHandler refetches album art
func RefetchArtHandler() http.HandlerFunc {
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

// ModifyMetadataHandler modifies album metadata
func ModifyMetadataHandler() http.HandlerFunc {
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

// ModifyItemHandler modifies item/track metadata
func ModifyItemHandler() http.HandlerFunc {
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

// GetMusicBrainzRecommendationsHandler fetches metadata recommendations from MusicBrainz
func GetMusicBrainzRecommendationsHandler(db *beets.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		albumIDStr := r.URL.Query().Get("album_id")
		if albumIDStr == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "album_id required"})
			return
		}

		var albumID int64
		fmt.Sscanf(albumIDStr, "%d", &albumID)

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		// Get album from database to get MusicBrainz ID
		album, err := db.GetAlbumByID(ctx, albumID)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Album not found"})
			return
		}

		if !album.MusicBrainzAlbumID.Valid || album.MusicBrainzAlbumID.String == "" {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "No MusicBrainz ID available for this album"})
			return
		}

		mbID := album.MusicBrainzAlbumID.String

		// Query MusicBrainz API (include both genres and tags since MB often stores genre data in tags)
		mbURL := fmt.Sprintf("https://musicbrainz.org/ws/2/release/%s?inc=recordings+artist-credits+labels+genres+tags&fmt=json", mbID)
		req, err := http.NewRequestWithContext(ctx, "GET", mbURL, nil)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to create request"})
			return
		}

		req.Header.Set("User-Agent", "Beetroot/1.0 (https://github.com/frostplexx/beetroot)")

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to query MusicBrainz"})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "MusicBrainz returned error"})
			return
		}

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to read response"})
			return
		}

		var mbData map[string]interface{}
		if err := json.Unmarshal(body, &mbData); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to parse MusicBrainz data"})
			return
		}

		// Extract relevant metadata
		recommendations := make(map[string]interface{})

		if title, ok := mbData["title"].(string); ok {
			recommendations["album"] = title
		}

		if artistCredits, ok := mbData["artist-credit"].([]interface{}); ok && len(artistCredits) > 0 {
			if firstArtist, ok := artistCredits[0].(map[string]interface{}); ok {
				if artist, ok := firstArtist["artist"].(map[string]interface{}); ok {
					if name, ok := artist["name"].(string); ok {
						recommendations["albumartist"] = name
					}
				}
			}
		}

		if date, ok := mbData["date"].(string); ok && len(date) >= 4 {
			recommendations["year"] = date[:4]
		}

		if country, ok := mbData["country"].(string); ok {
			recommendations["country"] = country
		}

		if labelInfo, ok := mbData["label-info"].([]interface{}); ok && len(labelInfo) > 0 {
			if firstLabel, ok := labelInfo[0].(map[string]interface{}); ok {
				if label, ok := firstLabel["label"].(map[string]interface{}); ok {
					if name, ok := label["name"].(string); ok {
						recommendations["label"] = name
					}
				}
			}
		}

		// Try to get genres from both "genres" and "tags" fields
		genreNames := []string{}

		// First try the genres field
		if genres, ok := mbData["genres"].([]interface{}); ok && len(genres) > 0 {
			for _, g := range genres {
				if genreObj, ok := g.(map[string]interface{}); ok {
					if name, ok := genreObj["name"].(string); ok {
						genreNames = append(genreNames, name)
					}
				}
			}
		}

		// If no genres, try tags (MusicBrainz often stores genre info here)
		if len(genreNames) == 0 {
			if tags, ok := mbData["tags"].([]interface{}); ok && len(tags) > 0 {
				// Only take the top 3 tags as genres
				maxTags := 3
				if len(tags) < maxTags {
					maxTags = len(tags)
				}
				for i := 0; i < maxTags; i++ {
					if tagObj, ok := tags[i].(map[string]interface{}); ok {
						if name, ok := tagObj["name"].(string); ok {
							genreNames = append(genreNames, name)
						}
					}
				}
			}
		}

		if len(genreNames) > 0 {
			// Join with comma-space like the frontend expects
			genreStr := ""
			for i, name := range genreNames {
				if i > 0 {
					genreStr += ", "
				}
				genreStr += name
			}
			recommendations["genre"] = genreStr
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":          "success",
			"recommendations": recommendations,
		})
	}
}
