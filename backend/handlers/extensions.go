package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"backend/extensions"
)

// ListExtensionsHandler lists all installed extensions
func ListExtensionsHandler(db *extensions.ExtensionDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Get enabled_only query param
		enabledOnly := r.URL.Query().Get("enabled_only") == "true"

		exts, err := db.ListExtensions(enabledOnly)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to list extensions: %v", err), http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"extensions": exts,
		})
	}
}

// GetExtensionHandler retrieves a single extension by ID
func GetExtensionHandler(db *extensions.ExtensionDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract ID from path
		idStr := strings.TrimPrefix(r.URL.Path, "/api/extensions/")
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid extension ID", http.StatusBadRequest)
			return
		}

		ext, err := db.GetExtension(id)
		if err != nil {
			http.Error(w, fmt.Sprintf("Extension not found: %v", err), http.StatusNotFound)
			return
		}

		// Don't include script content in response (too large)
		ext.ScriptContent = ""

		json.NewEncoder(w).Encode(ext)
	}
}

// InstallExtensionHandler installs an extension from uploaded ZIP
func InstallExtensionHandler(db *extensions.ExtensionDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Parse multipart form (max 10MB)
		err := r.ParseMultipartForm(10 << 20)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to parse form: %v", err), http.StatusBadRequest)
			return
		}

		// Get uploaded file
		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to get file: %v", err), http.StatusBadRequest)
			return
		}
		defer file.Close()

		// Validate file extension
		if !strings.HasSuffix(header.Filename, ".spotiflac-ext") && !strings.HasSuffix(header.Filename, ".zip") {
			http.Error(w, "Invalid file type (must be .spotiflac-ext or .zip)", http.StatusBadRequest)
			return
		}

		// Save to temp file
		tempDir := os.TempDir()
		tempFile := filepath.Join(tempDir, header.Filename)
		out, err := os.Create(tempFile)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create temp file: %v", err), http.StatusInternalServerError)
			return
		}
		defer os.Remove(tempFile)

		_, err = io.Copy(out, file)
		out.Close()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to save file: %v", err), http.StatusInternalServerError)
			return
		}

		// Install extension
		loader := extensions.NewExtensionLoader(db)
		id, err := loader.InstallExtension(tempFile)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to install extension: %v", err), http.StatusBadRequest)
			return
		}

		// Get installed extension
		ext, err := db.GetExtension(id)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to retrieve extension: %v", err), http.StatusInternalServerError)
			return
		}

		ext.ScriptContent = ""

		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":   true,
			"extension": ext,
		})
	}
}

// UpdateExtensionSettingsHandler updates extension settings
func UpdateExtensionSettingsHandler(db *extensions.ExtensionDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method != http.MethodPut {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract ID from path (/api/extensions/{id}/settings)
		pathParts := strings.Split(r.URL.Path, "/")
		if len(pathParts) < 4 {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}
		idStr := pathParts[3]
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid extension ID", http.StatusBadRequest)
			return
		}

		// Parse request body
		var req struct {
			Settings map[string]interface{} `json:"settings"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
			return
		}

		// Update settings
		if err := db.UpdateExtensionSettings(id, req.Settings); err != nil {
			http.Error(w, fmt.Sprintf("Failed to update settings: %v", err), http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
	}
}

// EnableExtensionHandler enables/disables an extension
func EnableExtensionHandler(db *extensions.ExtensionDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method != http.MethodPut {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract ID from path (/api/extensions/{id}/enable)
		pathParts := strings.Split(r.URL.Path, "/")
		if len(pathParts) < 4 {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}
		idStr := pathParts[3]
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid extension ID", http.StatusBadRequest)
			return
		}

		// Parse request body
		var req struct {
			Enabled bool `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
			return
		}

		// Update enabled status
		if err := db.EnableExtension(id, req.Enabled); err != nil {
			http.Error(w, fmt.Sprintf("Failed to update extension: %v", err), http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
	}
}

// UninstallExtensionHandler removes an extension
func UninstallExtensionHandler(db *extensions.ExtensionDB) http.HandlerFunc {
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
			http.Error(w, "Invalid extension ID", http.StatusBadRequest)
			return
		}

		// Uninstall extension
		if err := db.UninstallExtension(id); err != nil {
			http.Error(w, fmt.Sprintf("Failed to uninstall extension: %v", err), http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
	}
}
