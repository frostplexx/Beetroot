package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"backend/extensions"
)

// GetRegistryHandler fetches and returns the extension registry
func GetRegistryHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		client := extensions.NewRegistryClient()
		registry, err := client.FetchRegistry()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to fetch registry: %v", err), http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(registry)
	}
}

// InstallFromRegistryHandler installs an extension from the registry
func InstallFromRegistryHandler(db *extensions.ExtensionDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Parse request
		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
			return
		}

		if req.Name == "" {
			http.Error(w, "Extension name is required", http.StatusBadRequest)
			return
		}

		// Install from registry
		client := extensions.NewRegistryClient()
		id, err := client.InstallFromRegistry(db, req.Name)
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
