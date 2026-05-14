package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"backend/beets"
)

// RefetchMetadataHandler refetches album metadata from MusicBrainz
func RefetchMetadataHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		startTime := time.Now()

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

		// Validate album ID
		if req.AlbumID <= 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid album ID"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()

		albumName := fmt.Sprintf("Album ID %d", req.AlbumID)
		err := beets.RefetchAlbumMetadata(ctx, req.AlbumID)
		duration := time.Since(startTime)

		// Log the action
		if err != nil {
			LogAlbumAction(ctx, "refetch_metadata", req.AlbumID, albumName, nil, false, err.Error(), duration)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to refetch metadata"})
			return
		}

		LogAlbumAction(ctx, "refetch_metadata", req.AlbumID, albumName, nil, true, "", duration)
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

// RefetchArtHandler refetches album art
func RefetchArtHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		startTime := time.Now()

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

		// Validate album ID
		if req.AlbumID <= 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid album ID"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()

		albumName := fmt.Sprintf("Album ID %d", req.AlbumID)
		err := beets.RefetchAlbumArt(ctx, req.AlbumID)
		duration := time.Since(startTime)

		// Log the action
		if err != nil {
			LogAlbumAction(ctx, "refetch_art", req.AlbumID, albumName, nil, false, err.Error(), duration)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to refetch album art"})
			return
		}

		// Clear thumbnail cache to force regeneration with new art
		ClearThumbnailCache("")

		LogAlbumAction(ctx, "refetch_art", req.AlbumID, albumName, nil, true, "", duration)
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

// ModifyMetadataHandler modifies album metadata
func ModifyMetadataHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		startTime := time.Now()

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

		// Validate album ID
		if req.AlbumID <= 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid album ID"})
			return
		}

		// Validate updates map
		if len(req.Updates) == 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "No updates provided"})
			return
		}

		if len(req.Updates) > 50 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Too many fields to update"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		// Get album name for audit log (need DB)
		// We'll use a placeholder for now since we don't have DB access here
		albumName := fmt.Sprintf("Album ID %d", req.AlbumID)

		err := beets.ModifyAlbumMetadata(ctx, req.AlbumID, req.Updates)
		duration := time.Since(startTime)

		// Log the action
		details := map[string]interface{}{
			"updates": req.Updates,
		}
		if err != nil {
			LogAlbumAction(ctx, "modify_album", req.AlbumID, albumName, details, false, err.Error(), duration)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to modify metadata"})
			return
		}

		LogAlbumAction(ctx, "modify_album", req.AlbumID, albumName, details, true, "", duration)
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

		// Validate item ID
		if req.ItemID <= 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid item ID"})
			return
		}

		// Validate updates map
		if len(req.Updates) == 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "No updates provided"})
			return
		}

		if len(req.Updates) > 50 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Too many fields to update"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		if err := beets.ModifyItemMetadata(ctx, req.ItemID, req.Updates); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to modify metadata"})
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

// SearchMusicBrainzHandler searches MusicBrainz for album matches
func SearchMusicBrainzHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		artist := r.URL.Query().Get("artist")
		album := r.URL.Query().Get("album")

		if artist == "" || album == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Artist and album parameters are required",
			})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		// Search MusicBrainz
		results, err := searchMusicBrainz(ctx, artist, album)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": fmt.Sprintf("MusicBrainz search failed: %v", err),
			})
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": results,
		})
	}
}

type MusicBrainzSearchResult struct {
	ID           string   `json:"id"`
	Title        string   `json:"title"`
	Artist       string   `json:"artist"`
	Date         string   `json:"date"`
	Country      string   `json:"country"`
	Label        string   `json:"label"`
	CatalogNum   string   `json:"catalog_num"`
	Barcode      string   `json:"barcode"`
	TrackCount   int      `json:"track_count"`
	Format       string   `json:"format"`
	Status       string   `json:"status"`
	ReleaseGroup string   `json:"release_group"`
	Score        int      `json:"score"`
}

func searchMusicBrainz(ctx context.Context, artist, album string) ([]MusicBrainzSearchResult, error) {
	// Build MusicBrainz search query
	query := fmt.Sprintf(`artist:"%s" AND release:"%s"`, artist, album)
	searchURL := fmt.Sprintf("https://musicbrainz.org/ws/2/release?query=%s&fmt=json&limit=10",
		url.QueryEscape(query))

	req, err := http.NewRequestWithContext(ctx, "GET", searchURL, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", "Beetroot/1.0 (https://github.com/yourusername/beetroot)")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("MusicBrainz returned %d: %s", resp.StatusCode, string(body))
	}

	var mbResp struct {
		Releases []struct {
			ID    string `json:"id"`
			Title string `json:"title"`
			Score int    `json:"score"`
			Date  string `json:"date"`
			Country string `json:"country"`
			Status  string `json:"status"`
			ArtistCredit []struct {
				Name string `json:"name"`
			} `json:"artist-credit"`
			LabelInfo []struct {
				Label struct {
					Name string `json:"name"`
				} `json:"label"`
				CatalogNumber string `json:"catalog-number"`
			} `json:"label-info"`
			Barcode string `json:"barcode"`
			Media []struct {
				Format     string `json:"format"`
				TrackCount int    `json:"track-count"`
			} `json:"media"`
			ReleaseGroup struct {
				ID string `json:"id"`
			} `json:"release-group"`
		} `json:"releases"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&mbResp); err != nil {
		return nil, err
	}

	results := make([]MusicBrainzSearchResult, 0, len(mbResp.Releases))
	for _, rel := range mbResp.Releases {
		result := MusicBrainzSearchResult{
			ID:           rel.ID,
			Title:        rel.Title,
			Date:         rel.Date,
			Country:      rel.Country,
			Status:       rel.Status,
			Barcode:      rel.Barcode,
			ReleaseGroup: rel.ReleaseGroup.ID,
			Score:        rel.Score,
		}

		// Extract artist name
		if len(rel.ArtistCredit) > 0 {
			result.Artist = rel.ArtistCredit[0].Name
		}

		// Extract label and catalog number
		if len(rel.LabelInfo) > 0 {
			result.Label = rel.LabelInfo[0].Label.Name
			result.CatalogNum = rel.LabelInfo[0].CatalogNumber
		}

		// Extract format and track count
		if len(rel.Media) > 0 {
			result.Format = rel.Media[0].Format
			result.TrackCount = rel.Media[0].TrackCount
		}

		results = append(results, result)
	}

	return results, nil
}
