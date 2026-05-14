package handlers

import (
	"net/http"
	"path"
	"path/filepath"
	"strings"
)

// FrontendHandler serves built frontend assets and falls back to index.html for SPA routes.
func FrontendHandler(distDir string) http.Handler {
	cleanDistDir := filepath.Clean(distDir)
	indexPath := filepath.Join(cleanDistDir, "index.html")
	fileServer := http.FileServer(http.Dir(cleanDistDir))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		requestPath := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if requestPath == "" {
			http.ServeFile(w, r, indexPath)
			return
		}

		if strings.Contains(requestPath, "..") {
			http.NotFound(w, r)
			return
		}

		if strings.Contains(filepath.Base(requestPath), ".") {
			assetReq := r.Clone(r.Context())
			assetReq.URL.Path = "/" + requestPath
			fileServer.ServeHTTP(w, assetReq)
			return
		}

		http.ServeFile(w, r, indexPath)
	})
}
