package extensions

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const (
	RegistryURL = "https://raw.githubusercontent.com/spotiflacapp/SpotiFLAC-Extension/refs/heads/main/registry.json"
)

// RegistryExtension represents an extension in the registry
type RegistryExtension struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	DisplayName string   `json:"display_name"`
	Version     string   `json:"version"`
	Description string   `json:"description"`
	DownloadURL string   `json:"download_url"`
	IconURL     string   `json:"icon_url,omitempty"`
	Category    string   `json:"category"`
	Tags        []string `json:"tags,omitempty"`
	Downloads   int      `json:"downloads"`
	UpdatedAt   string   `json:"updated_at"`
	MinAppVersion string `json:"min_app_version,omitempty"`
}

// Registry represents the extension registry
type Registry struct {
	Version    int                 `json:"version"`
	UpdatedAt  string              `json:"updated_at"`
	Extensions []RegistryExtension `json:"extensions"`
}

// RegistryClient manages the extension registry
type RegistryClient struct {
	httpClient *http.Client
}

// NewRegistryClient creates a new registry client
func NewRegistryClient() *RegistryClient {
	return &RegistryClient{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// FetchRegistry fetches the extension registry
func (rc *RegistryClient) FetchRegistry() (*Registry, error) {
	resp, err := rc.httpClient.Get(RegistryURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch registry: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("registry returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read registry: %w", err)
	}

	var registry Registry
	if err := json.Unmarshal(body, &registry); err != nil {
		return nil, fmt.Errorf("failed to parse registry: %w", err)
	}

	return &registry, nil
}

// GetExtension retrieves a specific extension from the registry
func (rc *RegistryClient) GetExtension(name string) (*RegistryExtension, error) {
	registry, err := rc.FetchRegistry()
	if err != nil {
		return nil, err
	}

	for _, ext := range registry.Extensions {
		if ext.Name == name || ext.ID == name {
			return &ext, nil
		}
	}

	return nil, fmt.Errorf("extension %s not found in registry", name)
}

// DownloadExtension downloads an extension from the registry
func (rc *RegistryClient) DownloadExtension(downloadURL string) (string, error) {
	resp, err := rc.httpClient.Get(downloadURL)
	if err != nil {
		return "", fmt.Errorf("failed to download extension: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download returned status %d", resp.StatusCode)
	}

	// Create temp file
	tempDir := os.TempDir()
	tempFile := filepath.Join(tempDir, fmt.Sprintf("extension-%d.spotiflac-ext", time.Now().Unix()))

	out, err := os.Create(tempFile)
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	defer out.Close()

	// Copy response to file
	_, err = io.Copy(out, resp.Body)
	if err != nil {
		os.Remove(tempFile)
		return "", fmt.Errorf("failed to save extension: %w", err)
	}

	return tempFile, nil
}

// InstallFromRegistry installs an extension from the registry
func (rc *RegistryClient) InstallFromRegistry(db *ExtensionDB, name string) (int64, error) {
	// Get extension from registry
	regExt, err := rc.GetExtension(name)
	if err != nil {
		return 0, err
	}

	// Download extension
	tempFile, err := rc.DownloadExtension(regExt.DownloadURL)
	if err != nil {
		return 0, err
	}
	defer os.Remove(tempFile)

	// Install extension
	loader := NewExtensionLoader(db)
	id, err := loader.InstallExtension(tempFile)
	if err != nil {
		return 0, fmt.Errorf("failed to install extension: %w", err)
	}

	return id, nil
}
