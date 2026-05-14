package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"backend/beets"

	zlog "github.com/rs/zerolog/log"
)

// MetadataSource represents a source of metadata
type MetadataSource string

const (
	SourceMusicBrainz MetadataSource = "musicbrainz"
	SourceSpotify     MetadataSource = "spotify"
	SourceAppleMusic  MetadataSource = "apple"
	SourceDiscogs     MetadataSource = "discogs"
)

// SourceWeight defines voting weight for each source
var SourceWeights = map[MetadataSource]int{
	SourceSpotify:     2, // Higher weight
	SourceAppleMusic:  2, // Higher weight
	SourceMusicBrainz: 1,
	SourceDiscogs:     1,
}

// MetadataRecommendation holds metadata from a single source
type MetadataRecommendation struct {
	Album       string
	AlbumArtist string
	Year        string
	Country     string
	Label       string
	Genre       string
	Source      MetadataSource
}

// GetMetadataRecommendationsHandler aggregates metadata from multiple sources
func GetMetadataRecommendationsHandler(db *beets.DB) http.HandlerFunc {
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

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		// Get album from database
		album, err := db.GetAlbumByID(ctx, albumID)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Album not found"})
			return
		}

		// Collect recommendations from all sources in parallel
		type result struct {
			rec MetadataRecommendation
			err error
		}

		results := make(chan result, 4)

		// Query MusicBrainz
		go func() {
			if album.MusicBrainzAlbumID.Valid && album.MusicBrainzAlbumID.String != "" {
				rec, err := fetchMusicBrainzMetadata(ctx, album.MusicBrainzAlbumID.String)
				results <- result{rec, err}
			} else {
				results <- result{err: fmt.Errorf("no MusicBrainz ID")}
			}
		}()

		// Query Spotify
		go func() {
			rec, err := fetchSpotifyMetadata(ctx, album.Album, album.AlbumArtist)
			results <- result{rec, err}
		}()

		// Query Apple Music
		go func() {
			rec, err := fetchAppleMusicMetadata(ctx, album.Album, album.AlbumArtist)
			results <- result{rec, err}
		}()

		// Query Discogs
		go func() {
			rec, err := fetchDiscogsMetadata(ctx, album.Album, album.AlbumArtist)
			results <- result{rec, err}
		}()

		// Collect results
		var recommendations []MetadataRecommendation
		for i := 0; i < 4; i++ {
			r := <-results
			if r.err == nil {
				recommendations = append(recommendations, r.rec)
				zlog.Info().Str("source", string(r.rec.Source)).Msg("Successfully fetched metadata")
			} else {
				zlog.Debug().Err(r.err).Msg("Failed to fetch from source")
			}
		}

		if len(recommendations) == 0 {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "No metadata found from any source"})
			return
		}

		// Use weighted consensus to pick best recommendations
		consensus := buildConsensus(recommendations)

		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":          "success",
			"recommendations": consensus,
			"sources_used":    len(recommendations),
		})
	}
}

// buildConsensus uses weighted voting to determine best metadata values
func buildConsensus(recs []MetadataRecommendation) map[string]string {
	consensus := make(map[string]string)

	// For each field, count weighted votes
	fields := []struct {
		name   string
		getter func(MetadataRecommendation) string
	}{
		{"album", func(r MetadataRecommendation) string { return r.Album }},
		{"albumartist", func(r MetadataRecommendation) string { return r.AlbumArtist }},
		{"year", func(r MetadataRecommendation) string { return r.Year }},
		{"country", func(r MetadataRecommendation) string { return r.Country }},
		{"label", func(r MetadataRecommendation) string { return r.Label }},
		{"genre", func(r MetadataRecommendation) string { return r.Genre }},
	}

	for _, field := range fields {
		votes := make(map[string]int)

		for _, rec := range recs {
			value := field.getter(rec)
			if value != "" {
				weight := SourceWeights[rec.Source]
				votes[value] += weight
			}
		}

		// Pick value with highest vote count
		var bestValue string
		maxVotes := 0
		for value, count := range votes {
			if count > maxVotes {
				maxVotes = count
				bestValue = value
			}
		}

		if bestValue != "" {
			consensus[field.name] = bestValue
		}
	}

	return consensus
}

// fetchMusicBrainzMetadata queries MusicBrainz API
func fetchMusicBrainzMetadata(ctx context.Context, mbID string) (MetadataRecommendation, error) {
	mbURL := fmt.Sprintf("https://musicbrainz.org/ws/2/release/%s?inc=recordings+artist-credits+labels+genres+tags&fmt=json", mbID)
	req, err := http.NewRequestWithContext(ctx, "GET", mbURL, nil)
	if err != nil {
		return MetadataRecommendation{}, err
	}

	req.Header.Set("User-Agent", "Beetroot/1.0 (https://github.com/frostplexx/beetroot)")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return MetadataRecommendation{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return MetadataRecommendation{}, fmt.Errorf("MusicBrainz returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return MetadataRecommendation{}, err
	}

	var mbData map[string]interface{}
	if err := json.Unmarshal(body, &mbData); err != nil {
		return MetadataRecommendation{}, err
	}

	rec := MetadataRecommendation{Source: SourceMusicBrainz}

	if title, ok := mbData["title"].(string); ok {
		rec.Album = title
	}

	if artistCredits, ok := mbData["artist-credit"].([]interface{}); ok && len(artistCredits) > 0 {
		if firstArtist, ok := artistCredits[0].(map[string]interface{}); ok {
			if artist, ok := firstArtist["artist"].(map[string]interface{}); ok {
				if name, ok := artist["name"].(string); ok {
					rec.AlbumArtist = name
				}
			}
		}
	}

	if date, ok := mbData["date"].(string); ok && len(date) >= 4 {
		rec.Year = date[:4]
	}

	if country, ok := mbData["country"].(string); ok {
		rec.Country = country
	}

	if labelInfo, ok := mbData["label-info"].([]interface{}); ok && len(labelInfo) > 0 {
		if firstLabel, ok := labelInfo[0].(map[string]interface{}); ok {
			if label, ok := firstLabel["label"].(map[string]interface{}); ok {
				if name, ok := label["name"].(string); ok {
					rec.Label = name
				}
			}
		}
	}

	// Extract genres
	genreNames := []string{}
	if genres, ok := mbData["genres"].([]interface{}); ok {
		for _, g := range genres {
			if genreObj, ok := g.(map[string]interface{}); ok {
				if name, ok := genreObj["name"].(string); ok {
					genreNames = append(genreNames, name)
				}
			}
		}
	}

	if len(genreNames) == 0 {
		if tags, ok := mbData["tags"].([]interface{}); ok {
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
		rec.Genre = strings.Join(genreNames, ", ")
	}

	return rec, nil
}

// fetchSpotifyMetadata queries Spotify API
func fetchSpotifyMetadata(ctx context.Context, album, artist string) (MetadataRecommendation, error) {
	// Check for Spotify token in environment
	token := getSpotifyToken()
	if token == "" {
		return MetadataRecommendation{}, fmt.Errorf("no Spotify token configured")
	}

	// Search Spotify for the album
	query := fmt.Sprintf("album:%s artist:%s", album, artist)
	searchURL := fmt.Sprintf("https://api.spotify.com/v1/search?q=%s&type=album&limit=1", url.QueryEscape(query))

	req, err := http.NewRequestWithContext(ctx, "GET", searchURL, nil)
	if err != nil {
		return MetadataRecommendation{}, err
	}

	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return MetadataRecommendation{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return MetadataRecommendation{}, fmt.Errorf("Spotify returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return MetadataRecommendation{}, err
	}

	var spotifyData struct {
		Albums struct {
			Items []map[string]interface{} `json:"items"`
		} `json:"albums"`
	}
	if err := json.Unmarshal(body, &spotifyData); err != nil {
		return MetadataRecommendation{}, err
	}

	if len(spotifyData.Albums.Items) == 0 {
		return MetadataRecommendation{}, fmt.Errorf("no results found")
	}

	result := spotifyData.Albums.Items[0]
	rec := MetadataRecommendation{Source: SourceSpotify}

	if name, ok := result["name"].(string); ok {
		rec.Album = name
	}

	if artists, ok := result["artists"].([]interface{}); ok && len(artists) > 0 {
		if artist, ok := artists[0].(map[string]interface{}); ok {
			if name, ok := artist["name"].(string); ok {
				rec.AlbumArtist = name
			}
		}
	}

	if releaseDate, ok := result["release_date"].(string); ok && len(releaseDate) >= 4 {
		rec.Year = releaseDate[:4]
	}

	if genres, ok := result["genres"].([]interface{}); ok && len(genres) > 0 {
		genreStrs := []string{}
		for _, g := range genres {
			if genreStr, ok := g.(string); ok {
				genreStrs = append(genreStrs, genreStr)
			}
		}
		if len(genreStrs) > 0 {
			rec.Genre = strings.Join(genreStrs, ", ")
		}
	}

	return rec, nil
}

// getSpotifyToken retrieves Spotify access token from environment or config
// In production, this should use OAuth 2.0 Client Credentials flow
func getSpotifyToken() string {
	// Check for pre-configured token
	if token := getEnv("SPOTIFY_ACCESS_TOKEN"); token != "" {
		return token
	}

	// TODO: Implement automatic token refresh using client credentials
	// For now, users need to manually set SPOTIFY_ACCESS_TOKEN env variable
	return ""
}

func getEnv(key string) string {
	val, exists := os.LookupEnv(key)
	if exists {
		return val
	}
	return ""
}

// fetchAppleMusicMetadata queries Apple Music API
func fetchAppleMusicMetadata(ctx context.Context, album, artist string) (MetadataRecommendation, error) {
	// Search Apple Music for the album
	query := fmt.Sprintf("%s %s", album, artist)
	searchURL := fmt.Sprintf("https://itunes.apple.com/search?term=%s&entity=album&limit=1", url.QueryEscape(query))

	req, err := http.NewRequestWithContext(ctx, "GET", searchURL, nil)
	if err != nil {
		return MetadataRecommendation{}, err
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return MetadataRecommendation{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return MetadataRecommendation{}, fmt.Errorf("Apple Music returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return MetadataRecommendation{}, err
	}

	var appleData struct {
		Results []map[string]interface{} `json:"results"`
	}
	if err := json.Unmarshal(body, &appleData); err != nil {
		return MetadataRecommendation{}, err
	}

	if len(appleData.Results) == 0 {
		return MetadataRecommendation{}, fmt.Errorf("no results found")
	}

	result := appleData.Results[0]
	rec := MetadataRecommendation{Source: SourceAppleMusic}

	if collectionName, ok := result["collectionName"].(string); ok {
		rec.Album = collectionName
	}

	if artistName, ok := result["artistName"].(string); ok {
		rec.AlbumArtist = artistName
	}

	if releaseDate, ok := result["releaseDate"].(string); ok && len(releaseDate) >= 4 {
		rec.Year = releaseDate[:4]
	}

	if country, ok := result["country"].(string); ok {
		rec.Country = country
	}

	if primaryGenreName, ok := result["primaryGenreName"].(string); ok {
		rec.Genre = primaryGenreName
	}

	return rec, nil
}

// fetchDiscogsMetadata queries Discogs API
func fetchDiscogsMetadata(ctx context.Context, album, artist string) (MetadataRecommendation, error) {
	// Search Discogs for the album
	query := fmt.Sprintf("%s %s", artist, album)
	searchURL := fmt.Sprintf("https://api.discogs.com/database/search?q=%s&type=release&per_page=1", url.QueryEscape(query))

	req, err := http.NewRequestWithContext(ctx, "GET", searchURL, nil)
	if err != nil {
		return MetadataRecommendation{}, err
	}

	req.Header.Set("User-Agent", "Beetroot/1.0 +https://github.com/frostplexx/beetroot")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return MetadataRecommendation{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return MetadataRecommendation{}, fmt.Errorf("Discogs returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return MetadataRecommendation{}, err
	}

	var discogsData struct {
		Results []map[string]interface{} `json:"results"`
	}
	if err := json.Unmarshal(body, &discogsData); err != nil {
		return MetadataRecommendation{}, err
	}

	if len(discogsData.Results) == 0 {
		return MetadataRecommendation{}, fmt.Errorf("no results found")
	}

	result := discogsData.Results[0]
	rec := MetadataRecommendation{Source: SourceDiscogs}

	if title, ok := result["title"].(string); ok {
		// Discogs returns "Artist - Album" format, split it
		parts := strings.SplitN(title, " - ", 2)
		if len(parts) == 2 {
			rec.AlbumArtist = parts[0]
			rec.Album = parts[1]
		} else {
			rec.Album = title
		}
	}

	if year, ok := result["year"].(string); ok {
		rec.Year = year
	}

	if country, ok := result["country"].(string); ok {
		rec.Country = country
	}

	if label, ok := result["label"].([]interface{}); ok && len(label) > 0 {
		if labelStr, ok := label[0].(string); ok {
			rec.Label = labelStr
		}
	}

	if genre, ok := result["genre"].([]interface{}); ok && len(genre) > 0 {
		genres := []string{}
		for _, g := range genre {
			if genreStr, ok := g.(string); ok {
				genres = append(genres, genreStr)
			}
		}
		rec.Genre = strings.Join(genres, ", ")
	}

	return rec, nil
}
