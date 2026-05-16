package extensions

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// Extension represents a SpotiFLAC extension
type Extension struct {
	ID            int64                  `json:"id"`
	Name          string                 `json:"name"`
	Version       string                 `json:"version"`
	Type          string                 `json:"type"`
	Enabled       bool                   `json:"enabled"`
	Manifest      Manifest               `json:"manifest"`
	ScriptContent string                 `json:"script_content,omitempty"`
	Settings      map[string]interface{} `json:"settings"`
	InstalledAt   time.Time              `json:"installed_at"`
	UpdatedAt     time.Time              `json:"updated_at"`
}

// Manifest represents the extension manifest.json
type Manifest struct {
	Name        string            `json:"name"`
	DisplayName string            `json:"displayName,omitempty"`
	Version     string            `json:"version"`
	Description string            `json:"description"`
	Author      string            `json:"author,omitempty"`
	Homepage    string            `json:"homepage,omitempty"`
	Icon        string            `json:"icon,omitempty"`
	Type        []string          `json:"type"`
	Permissions map[string]interface{} `json:"permissions,omitempty"`
	Settings    []ManifestSetting `json:"settings,omitempty"`
}

// ManifestSetting represents a setting in the manifest
type ManifestSetting struct {
	Key         string        `json:"key"`
	Label       string        `json:"label"`
	Type        string        `json:"type"` // text, password, select, boolean
	Description string        `json:"description,omitempty"`
	Required    bool          `json:"required,omitempty"`
	Secret      bool          `json:"secret,omitempty"`
	Default     interface{}   `json:"default,omitempty"`
	Options     []string      `json:"options,omitempty"`
}

// DownloadQueueItem represents a download in the queue
type DownloadQueueItem struct {
	ID           int64     `json:"id"`
	ExtensionID  sql.NullInt64 `json:"extension_id"`
	URL          string    `json:"url"`
	Title        string    `json:"title"`
	Artist       string    `json:"artist"`
	Album        string    `json:"album"`
	Status       string    `json:"status"` // pending, downloading, completed, failed, importing
	Progress     float64   `json:"progress"`
	FilePath     string    `json:"file_path"`
	ErrorMessage string    `json:"error_message"`
	AutoImport   bool      `json:"auto_import"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// ExtensionDB manages the extensions database
type ExtensionDB struct {
	db *sql.DB
}

// NewExtensionDB creates a new extension database connection
func NewExtensionDB(dbPath string) (*ExtensionDB, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Create tables
	if err := createTables(db); err != nil {
		return nil, fmt.Errorf("failed to create tables: %w", err)
	}

	return &ExtensionDB{db: db}, nil
}

// Close closes the database connection
func (edb *ExtensionDB) Close() error {
	return edb.db.Close()
}

// createTables creates the necessary database tables
func createTables(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS extensions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		version TEXT NOT NULL,
		type TEXT NOT NULL,
		enabled INTEGER DEFAULT 1,
		manifest_json TEXT NOT NULL,
		script_content TEXT NOT NULL,
		settings_json TEXT,
		installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS extension_storage (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		extension_id INTEGER NOT NULL,
		key TEXT NOT NULL,
		value TEXT,
		FOREIGN KEY(extension_id) REFERENCES extensions(id) ON DELETE CASCADE,
		UNIQUE(extension_id, key)
	);

	CREATE TABLE IF NOT EXISTS download_queue (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		extension_id INTEGER,
		url TEXT NOT NULL,
		title TEXT,
		artist TEXT,
		album TEXT,
		status TEXT DEFAULT 'pending',
		progress REAL DEFAULT 0,
		file_path TEXT,
		error_message TEXT,
		auto_import INTEGER DEFAULT 1,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(extension_id) REFERENCES extensions(id) ON DELETE SET NULL
	);

	CREATE INDEX IF NOT EXISTS idx_extension_storage_ext_id ON extension_storage(extension_id);
	CREATE INDEX IF NOT EXISTS idx_download_queue_status ON download_queue(status);
	`

	_, err := db.Exec(schema)
	return err
}

// InstallExtension installs a new extension
func (edb *ExtensionDB) InstallExtension(ext Extension) (int64, error) {
	manifestJSON, err := json.Marshal(ext.Manifest)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal manifest: %w", err)
	}

	settingsJSON := "{}"
	if len(ext.Settings) > 0 {
		settings, err := json.Marshal(ext.Settings)
		if err != nil {
			return 0, fmt.Errorf("failed to marshal settings: %w", err)
		}
		settingsJSON = string(settings)
	}

	result, err := edb.db.Exec(`
		INSERT INTO extensions (name, version, type, enabled, manifest_json, script_content, settings_json)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, ext.Name, ext.Version, ext.Type, ext.Enabled, string(manifestJSON), ext.ScriptContent, settingsJSON)

	if err != nil {
		return 0, fmt.Errorf("failed to insert extension: %w", err)
	}

	return result.LastInsertId()
}

// GetExtension retrieves an extension by ID
func (edb *ExtensionDB) GetExtension(id int64) (*Extension, error) {
	var ext Extension
	var manifestJSON, settingsJSON string
	var enabled int

	err := edb.db.QueryRow(`
		SELECT id, name, version, type, enabled, manifest_json, script_content, settings_json, installed_at, updated_at
		FROM extensions WHERE id = ?
	`, id).Scan(&ext.ID, &ext.Name, &ext.Version, &ext.Type, &enabled, &manifestJSON, &ext.ScriptContent, &settingsJSON, &ext.InstalledAt, &ext.UpdatedAt)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("extension not found")
		}
		return nil, err
	}

	ext.Enabled = enabled == 1

	if err := json.Unmarshal([]byte(manifestJSON), &ext.Manifest); err != nil {
		return nil, fmt.Errorf("failed to unmarshal manifest: %w", err)
	}

	if settingsJSON != "" {
		if err := json.Unmarshal([]byte(settingsJSON), &ext.Settings); err != nil {
			return nil, fmt.Errorf("failed to unmarshal settings: %w", err)
		}
	}

	return &ext, nil
}

// GetExtensionByName retrieves an extension by name
func (edb *ExtensionDB) GetExtensionByName(name string) (*Extension, error) {
	var ext Extension
	var manifestJSON, settingsJSON string
	var enabled int

	err := edb.db.QueryRow(`
		SELECT id, name, version, type, enabled, manifest_json, script_content, settings_json, installed_at, updated_at
		FROM extensions WHERE name = ?
	`, name).Scan(&ext.ID, &ext.Name, &ext.Version, &ext.Type, &enabled, &manifestJSON, &ext.ScriptContent, &settingsJSON, &ext.InstalledAt, &ext.UpdatedAt)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("extension not found")
		}
		return nil, err
	}

	ext.Enabled = enabled == 1

	if err := json.Unmarshal([]byte(manifestJSON), &ext.Manifest); err != nil {
		return nil, fmt.Errorf("failed to unmarshal manifest: %w", err)
	}

	if settingsJSON != "" && settingsJSON != "{}" {
		if err := json.Unmarshal([]byte(settingsJSON), &ext.Settings); err != nil {
			return nil, fmt.Errorf("failed to unmarshal settings: %w", err)
		}
	} else {
		ext.Settings = make(map[string]interface{})
	}

	return &ext, nil
}

// ListExtensions retrieves all extensions
func (edb *ExtensionDB) ListExtensions(enabledOnly bool) ([]Extension, error) {
	query := `
		SELECT id, name, version, type, enabled, manifest_json, settings_json, installed_at, updated_at
		FROM extensions
	`
	if enabledOnly {
		query += " WHERE enabled = 1"
	}
	query += " ORDER BY name"

	rows, err := edb.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var extensions []Extension
	for rows.Next() {
		var ext Extension
		var manifestJSON, settingsJSON string
		var enabled int

		err := rows.Scan(&ext.ID, &ext.Name, &ext.Version, &ext.Type, &enabled, &manifestJSON, &settingsJSON, &ext.InstalledAt, &ext.UpdatedAt)
		if err != nil {
			return nil, err
		}

		ext.Enabled = enabled == 1

		if err := json.Unmarshal([]byte(manifestJSON), &ext.Manifest); err != nil {
			return nil, fmt.Errorf("failed to unmarshal manifest for %s: %w", ext.Name, err)
		}

		if settingsJSON != "" && settingsJSON != "{}" {
			if err := json.Unmarshal([]byte(settingsJSON), &ext.Settings); err != nil {
				return nil, fmt.Errorf("failed to unmarshal settings for %s: %w", ext.Name, err)
			}
		} else {
			ext.Settings = make(map[string]interface{})
		}

		// Don't include script content in list responses
		ext.ScriptContent = ""
		extensions = append(extensions, ext)
	}

	return extensions, rows.Err()
}

// UpdateExtensionSettings updates the settings for an extension
func (edb *ExtensionDB) UpdateExtensionSettings(id int64, settings map[string]interface{}) error {
	settingsJSON, err := json.Marshal(settings)
	if err != nil {
		return fmt.Errorf("failed to marshal settings: %w", err)
	}

	_, err = edb.db.Exec(`
		UPDATE extensions
		SET settings_json = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, string(settingsJSON), id)

	return err
}

// EnableExtension enables or disables an extension
func (edb *ExtensionDB) EnableExtension(id int64, enabled bool) error {
	enabledInt := 0
	if enabled {
		enabledInt = 1
	}

	_, err := edb.db.Exec(`
		UPDATE extensions
		SET enabled = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, enabledInt, id)

	return err
}

// UninstallExtension removes an extension
func (edb *ExtensionDB) UninstallExtension(id int64) error {
	_, err := edb.db.Exec("DELETE FROM extensions WHERE id = ?", id)
	return err
}

// GetStorage retrieves a value from extension storage
func (edb *ExtensionDB) GetStorage(extID int64, key string) (string, error) {
	var value string
	err := edb.db.QueryRow(`
		SELECT value FROM extension_storage
		WHERE extension_id = ? AND key = ?
	`, extID, key).Scan(&value)

	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

// SetStorage sets a value in extension storage
func (edb *ExtensionDB) SetStorage(extID int64, key, value string) error {
	_, err := edb.db.Exec(`
		INSERT INTO extension_storage (extension_id, key, value)
		VALUES (?, ?, ?)
		ON CONFLICT(extension_id, key)
		DO UPDATE SET value = excluded.value
	`, extID, key, value)

	return err
}

// DeleteStorage deletes a key from extension storage
func (edb *ExtensionDB) DeleteStorage(extID int64, key string) error {
	_, err := edb.db.Exec(`
		DELETE FROM extension_storage
		WHERE extension_id = ? AND key = ?
	`, extID, key)

	return err
}

// QueueDownload adds a download to the queue
func (edb *ExtensionDB) QueueDownload(item DownloadQueueItem) (int64, error) {
	result, err := edb.db.Exec(`
		INSERT INTO download_queue (extension_id, url, title, artist, album, status, auto_import)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, item.ExtensionID, item.URL, item.Title, item.Artist, item.Album, item.Status, item.AutoImport)

	if err != nil {
		return 0, err
	}

	return result.LastInsertId()
}

// GetDownloadQueue retrieves all downloads in the queue
func (edb *ExtensionDB) GetDownloadQueue() ([]DownloadQueueItem, error) {
	rows, err := edb.db.Query(`
		SELECT id, extension_id, url, title, artist, album, status, progress, file_path, error_message, auto_import, created_at, updated_at
		FROM download_queue
		ORDER BY created_at DESC
		LIMIT 100
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []DownloadQueueItem
	for rows.Next() {
		var item DownloadQueueItem
		err := rows.Scan(&item.ID, &item.ExtensionID, &item.URL, &item.Title, &item.Artist, &item.Album,
			&item.Status, &item.Progress, &item.FilePath, &item.ErrorMessage, &item.AutoImport, &item.CreatedAt, &item.UpdatedAt)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

// GetPendingDownloads retrieves pending downloads
func (edb *ExtensionDB) GetPendingDownloads() ([]DownloadQueueItem, error) {
	rows, err := edb.db.Query(`
		SELECT id, extension_id, url, title, artist, album, status, progress, file_path, error_message, auto_import, created_at, updated_at
		FROM download_queue
		WHERE status = 'pending'
		ORDER BY created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []DownloadQueueItem
	for rows.Next() {
		var item DownloadQueueItem
		err := rows.Scan(&item.ID, &item.ExtensionID, &item.URL, &item.Title, &item.Artist, &item.Album,
			&item.Status, &item.Progress, &item.FilePath, &item.ErrorMessage, &item.AutoImport, &item.CreatedAt, &item.UpdatedAt)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

// UpdateDownloadStatus updates a download's status
func (edb *ExtensionDB) UpdateDownloadStatus(id int64, status string, progress float64, filePath, errorMessage string) error {
	_, err := edb.db.Exec(`
		UPDATE download_queue
		SET status = ?, progress = ?, file_path = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, status, progress, filePath, errorMessage, id)

	return err
}

// DeleteDownload removes a download from the queue
func (edb *ExtensionDB) DeleteDownload(id int64) error {
	_, err := edb.db.Exec("DELETE FROM download_queue WHERE id = ?", id)
	return err
}
