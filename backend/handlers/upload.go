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
			file, err := fileHeader.Open()
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Failed to open file: %s", fileHeader.Filename)})
				return
			}
			defer file.Close()

			// Create destination file
			destPath := filepath.Join(uploadDir, fileHeader.Filename)
			destFile, err := os.Create(destPath)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Failed to create file: %s", fileHeader.Filename)})
				return
			}
			defer destFile.Close()

			// Copy file contents
			if _, err := io.Copy(destFile, file); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Failed to save file: %s", fileHeader.Filename)})
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
		go func() {
			time.Sleep(5 * time.Second)
			os.RemoveAll(req.Path)
		}()

		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}
