package extensions

import (
	"context"
	"fmt"
	"log"
	"sync"
)

// SearchResult represents a search result from an extension
type SearchResult struct {
	ExtensionID   int64                  `json:"extension_id"`
	ExtensionName string                 `json:"extension_name"`
	Type          string                 `json:"type"` // track, album, playlist
	Title         string                 `json:"title"`
	Artist        string                 `json:"artist"`
	Album         string                 `json:"album,omitempty"`
	Duration      int                    `json:"duration,omitempty"` // seconds
	URL           string                 `json:"url"`                // Extension-specific URL/ID
	ArtworkURL    string                 `json:"artwork_url,omitempty"`
	Year          int                    `json:"year,omitempty"`
	TrackCount    int                    `json:"track_count,omitempty"` // for albums
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
}

// SearchService manages searching across extensions
type SearchService struct {
	db       *ExtensionDB
	runtimes map[int64]*Runtime
	mu       sync.RWMutex
}

// NewSearchService creates a new search service
func NewSearchService(db *ExtensionDB) *SearchService {
	return &SearchService{
		db:       db,
		runtimes: make(map[int64]*Runtime),
	}
}

// Search searches across all enabled extensions
func (s *SearchService) Search(ctx context.Context, query string, types []string) ([]SearchResult, error) {
	// Get all enabled extensions
	extensions, err := s.db.ListExtensions(true)
	if err != nil {
		return nil, fmt.Errorf("failed to list extensions: %w", err)
	}

	// Filter extensions that are metadata providers
	var searchableExts []Extension
	for _, ext := range extensions {
		for _, t := range ext.Manifest.Type {
			if t == "metadata_provider" {
				searchableExts = append(searchableExts, ext)
				break
			}
		}
	}

	if len(searchableExts) == 0 {
		return []SearchResult{}, nil
	}

	// Search in parallel across all extensions
	resultsChan := make(chan []SearchResult, len(searchableExts))
	var wg sync.WaitGroup

	for _, ext := range searchableExts {
		wg.Add(1)
		go func(ext Extension) {
			defer wg.Done()
			results := s.searchExtension(ctx, ext, query, types)
			if len(results) > 0 {
				resultsChan <- results
			}
		}(ext)
	}

	// Wait for all searches to complete
	go func() {
		wg.Wait()
		close(resultsChan)
	}()

	// Collect all results
	var allResults []SearchResult
	for results := range resultsChan {
		allResults = append(allResults, results...)
	}

	return allResults, nil
}

// searchExtension searches a single extension
func (s *SearchService) searchExtension(ctx context.Context, ext Extension, query string, types []string) []SearchResult {
	// Get or create runtime for this extension
	runtime, err := s.getRuntime(ext)
	if err != nil {
		log.Printf("Failed to get runtime for %s: %v", ext.Name, err)
		return nil
	}

	// Prepare search options
	options := map[string]interface{}{
		"types": types,
		"limit": 20,
	}

	// Execute search
	results, err := runtime.ExecuteSearch(ctx, query, options)
	if err != nil {
		log.Printf("Search failed for %s: %v", ext.Name, err)
		return nil
	}

	// Convert to SearchResult objects
	var searchResults []SearchResult
	for _, result := range results {
		sr := SearchResult{
			ExtensionID:   ext.ID,
			ExtensionName: ext.Manifest.DisplayName,
		}

		// Extract fields from result
		if v, ok := result["type"].(string); ok {
			sr.Type = v
		}
		if v, ok := result["title"].(string); ok {
			sr.Title = v
		}
		if v, ok := result["name"].(string); ok && sr.Title == "" {
			sr.Title = v
		}
		if v, ok := result["artist"].(string); ok {
			sr.Artist = v
		}
		if v, ok := result["artists"].(string); ok && sr.Artist == "" {
			sr.Artist = v
		}
		if v, ok := result["album"].(string); ok {
			sr.Album = v
		}
		if v, ok := result["album_name"].(string); ok && sr.Album == "" {
			sr.Album = v
		}
		if v, ok := result["duration"].(float64); ok {
			sr.Duration = int(v)
		}
		if v, ok := result["url"].(string); ok {
			sr.URL = v
		}
		if v, ok := result["id"].(string); ok && sr.URL == "" {
			sr.URL = v
		}
		if v, ok := result["artwork_url"].(string); ok {
			sr.ArtworkURL = v
		}
		if v, ok := result["cover_url"].(string); ok && sr.ArtworkURL == "" {
			sr.ArtworkURL = v
		}
		if v, ok := result["images"].(string); ok && sr.ArtworkURL == "" {
			sr.ArtworkURL = v
		}
		if v, ok := result["year"].(float64); ok {
			sr.Year = int(v)
		}
		if v, ok := result["track_count"].(float64); ok {
			sr.TrackCount = int(v)
		}

		// Store original metadata
		sr.Metadata = result

		searchResults = append(searchResults, sr)
	}

	return searchResults
}

// getRuntime gets or creates a runtime for an extension
func (s *SearchService) getRuntime(ext Extension) (*Runtime, error) {
	s.mu.RLock()
	runtime, exists := s.runtimes[ext.ID]
	s.mu.RUnlock()

	if exists {
		return runtime, nil
	}

	// Create new runtime
	s.mu.Lock()
	defer s.mu.Unlock()

	// Double-check after acquiring write lock
	if runtime, exists := s.runtimes[ext.ID]; exists {
		return runtime, nil
	}

	// Reload extension to get latest settings
	freshExt, err := s.db.GetExtension(ext.ID)
	if err != nil {
		return nil, err
	}

	runtime, err = NewRuntime(freshExt, s.db)
	if err != nil {
		return nil, err
	}

	// Initialize extension
	if err := runtime.ExecuteInitialize(context.Background()); err != nil {
		log.Printf("Warning: initialize failed for %s: %v", ext.Name, err)
	}

	s.runtimes[ext.ID] = runtime
	return runtime, nil
}

// ClearRuntimeCache clears the runtime cache (useful after settings change)
func (s *SearchService) ClearRuntimeCache() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runtimes = make(map[int64]*Runtime)
}

// ClearExtensionRuntime clears a specific extension's runtime
func (s *SearchService) ClearExtensionRuntime(extID int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.runtimes, extID)
}
