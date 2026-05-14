package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// FrontendHandler serves built frontend assets and falls back to index.html for SPA routes.
func FrontendHandler(distDir string) http.Handler {
	cleanDistDir := filepath.Clean(distDir)
	indexPath := filepath.Join(cleanDistDir, "index.html")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		requestPath := filepath.Clean(strings.TrimPrefix(r.URL.Path, "/"))
		if requestPath == "." {
			http.ServeFile(w, r, indexPath)
			return
		}

		assetPath := filepath.Join(cleanDistDir, requestPath)
		if assetPath != cleanDistDir && !strings.HasPrefix(assetPath, cleanDistDir+string(os.PathSeparator)) {
			http.NotFound(w, r)
			return
		}

		if info, err := os.Stat(assetPath); err == nil && !info.IsDir() {
			http.ServeFile(w, r, assetPath)
			return
		}

		http.ServeFile(w, r, indexPath)
	})
}
