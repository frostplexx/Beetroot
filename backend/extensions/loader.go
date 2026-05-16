package extensions

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// ExtensionLoader handles loading extensions from ZIP files
type ExtensionLoader struct {
	db *ExtensionDB
}

// NewExtensionLoader creates a new extension loader
func NewExtensionLoader(db *ExtensionDB) *ExtensionLoader {
	return &ExtensionLoader{db: db}
}

// LoadFromZip loads an extension from a .spotiflac-ext ZIP file
func (l *ExtensionLoader) LoadFromZip(zipPath string) (*Extension, error) {
	// Open ZIP file
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open ZIP file: %w", err)
	}
	defer reader.Close()

	// Extract manifest.json and index.js
	var manifestData []byte
	var scriptData []byte

	for _, file := range reader.File {
		// Skip directories
		if file.FileInfo().IsDir() {
			continue
		}

		// Get filename (handle files in subdirectories)
		name := filepath.Base(file.Name)

		switch name {
		case "manifest.json":
			manifestData, err = readZipFile(file)
			if err != nil {
				return nil, fmt.Errorf("failed to read manifest.json: %w", err)
			}

		case "index.js", "extension.js":
			scriptData, err = readZipFile(file)
			if err != nil {
				return nil, fmt.Errorf("failed to read script file: %w", err)
			}
		}
	}

	// Validate required files
	if manifestData == nil {
		return nil, fmt.Errorf("manifest.json not found in ZIP")
	}
	if scriptData == nil {
		return nil, fmt.Errorf("index.js or extension.js not found in ZIP")
	}

	// Parse manifest
	var manifest Manifest
	if err := json.Unmarshal(manifestData, &manifest); err != nil {
		return nil, fmt.Errorf("failed to parse manifest.json: %w", err)
	}

	// Validate manifest
	if err := l.ValidateManifest(manifest); err != nil {
		return nil, fmt.Errorf("invalid manifest: %w", err)
	}

	// Create extension object
	ext := Extension{
		Name:          manifest.Name,
		Version:       manifest.Version,
		Type:          strings.Join(manifest.Type, ","),
		Enabled:       true,
		Manifest:      manifest,
		ScriptContent: string(scriptData),
		Settings:      make(map[string]interface{}),
	}

	// Initialize settings with defaults from manifest
	for _, setting := range manifest.Settings {
		if setting.Default != nil {
			ext.Settings[setting.Key] = setting.Default
		}
	}

	return &ext, nil
}

// ValidateManifest validates an extension manifest
func (l *ExtensionLoader) ValidateManifest(manifest Manifest) error {
	// Required fields
	if manifest.Name == "" {
		return fmt.Errorf("name is required")
	}
	if manifest.Version == "" {
		return fmt.Errorf("version is required")
	}
	if manifest.Description == "" {
		return fmt.Errorf("description is required")
	}
	if len(manifest.Type) == 0 {
		return fmt.Errorf("type is required")
	}

	// Validate name format (lowercase, alphanumeric, dashes, underscores)
	for _, char := range manifest.Name {
		if !((char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char == '-' || char == '_') {
			return fmt.Errorf("name must be lowercase alphanumeric with dashes or underscores")
		}
	}

	// Validate types
	validTypes := map[string]bool{
		"metadata_provider": true,
		"download_provider": true,
		"lyrics_provider":   true,
	}

	for _, t := range manifest.Type {
		if !validTypes[t] {
			return fmt.Errorf("invalid type: %s (must be metadata_provider, download_provider, or lyrics_provider)", t)
		}
	}

	// Validate settings
	for _, setting := range manifest.Settings {
		if setting.Key == "" {
			return fmt.Errorf("setting key is required")
		}
		if setting.Label == "" {
			return fmt.Errorf("setting label is required for key: %s", setting.Key)
		}
		if setting.Type == "" {
			return fmt.Errorf("setting type is required for key: %s", setting.Key)
		}

		// Validate setting type
		validSettingTypes := map[string]bool{
			"text":     true,
			"string":   true,
			"password": true,
			"select":   true,
			"boolean":  true,
			"number":   true,
		}
		if !validSettingTypes[setting.Type] {
			return fmt.Errorf("invalid setting type for %s: %s", setting.Key, setting.Type)
		}

		// Validate select options
		if setting.Type == "select" && len(setting.Options) == 0 {
			return fmt.Errorf("select setting %s must have options", setting.Key)
		}
	}

	return nil
}

// InstallExtension installs an extension from a ZIP file
func (l *ExtensionLoader) InstallExtension(zipPath string) (int64, error) {
	// Load extension from ZIP
	ext, err := l.LoadFromZip(zipPath)
	if err != nil {
		return 0, err
	}

	// Check if extension already exists
	existing, _ := l.db.GetExtensionByName(ext.Name)
	if existing != nil {
		return 0, fmt.Errorf("extension %s is already installed (version %s)", ext.Name, existing.Version)
	}

	// Install to database
	id, err := l.db.InstallExtension(*ext)
	if err != nil {
		return 0, fmt.Errorf("failed to install extension: %w", err)
	}

	return id, nil
}

// readZipFile reads a file from a ZIP archive
func readZipFile(file *zip.File) ([]byte, error) {
	reader, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	// Limit file size to 10MB
	const maxSize = 10 * 1024 * 1024
	if file.UncompressedSize64 > maxSize {
		return nil, fmt.Errorf("file too large: %s", file.Name)
	}

	return io.ReadAll(reader)
}

// UninstallExtension uninstalls an extension by name
func (l *ExtensionLoader) UninstallExtension(name string) error {
	ext, err := l.db.GetExtensionByName(name)
	if err != nil {
		return err
	}

	return l.db.UninstallExtension(ext.ID)
}

// LoadFromFile is a helper to install from a file path
func (l *ExtensionLoader) LoadFromFile(filePath string) (int64, error) {
	// Check file exists
	if _, err := os.Stat(filePath); err != nil {
		return 0, fmt.Errorf("file not found: %w", err)
	}

	// Check file extension
	if !strings.HasSuffix(filePath, ".spotiflac-ext") && !strings.HasSuffix(filePath, ".zip") {
		return 0, fmt.Errorf("invalid file extension (must be .spotiflac-ext or .zip)")
	}

	return l.InstallExtension(filePath)
}
