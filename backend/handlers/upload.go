package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"backend/beets"
)

// UploadHandler handles file uploads
func UploadHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		// Parse multipart form (max 500MB)
		if err := r.ParseMultipartForm(500 << 20); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to parse form data"})
			return
		}

		files := r.MultipartForm.File["files"]
		if len(files) == 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "No files uploaded"})
			return
		}

		// Create temporary upload directory
		uploadDir := filepath.Join(os.TempDir(), fmt.Sprintf("beetroot-upload-%d", time.Now().Unix()))
		if err := os.MkdirAll(uploadDir, 0755); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to create upload directory"})
			return
		}

		// Save uploaded files
		for _, fileHeader := range files {
			// Sanitize filename to prevent path traversal
			sanitizedName, err := sanitizeFilename(fileHeader.Filename)
			if err != nil {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Invalid filename: %s", fileHeader.Filename)})
				return
			}

			// Validate file size (max 500MB per file)
			if fileHeader.Size > 500<<20 {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("File too large: %s", sanitizedName)})
				return
			}

			file, err := fileHeader.Open()
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]string{"error": "Failed to open uploaded file"})
				return
			}
			defer file.Close()

			// Create destination file with sanitized name
			destPath := filepath.Join(uploadDir, sanitizedName)

			// Extra validation: ensure the resolved path is within uploadDir
			if err := validatePathWithinBase(uploadDir, destPath); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "Invalid file path"})
				return
			}

			destFile, err := os.Create(destPath)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]string{"error": "Failed to create file"})
				return
			}
			defer destFile.Close()

			// Copy file contents with size limit
			limitedReader := io.LimitReader(file, 500<<20)
			if _, err := io.Copy(destFile, limitedReader); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]string{"error": "Failed to save file"})
				return
			}
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":      "success",
			"upload_path": uploadDir,
			"file_count":  len(files),
		})
	}
}

// ImportHandler handles beets import
func ImportHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		var req struct {
			Path string `json:"path"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request"})
			return
		}

		if req.Path == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Path is required"})
			return
		}

		// Check if path exists
		if _, err := os.Stat(req.Path); os.IsNotExist(err) {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Path does not exist"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
		defer cancel()

		// Run beet import
		if err := beets.ImportPath(ctx, req.Path); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		// Clean up upload directory after successful import
		// Use defer with proper error handling instead of goroutine
		defer func() {
			if err := os.RemoveAll(req.Path); err != nil {
				// Log error but don't fail the request
				// User already got success response
			}
		}()

		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}
