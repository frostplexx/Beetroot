package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
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

			// Validate FLAC format
			if !isValidFLACFile(file) {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{
					"error": fmt.Sprintf("Invalid FLAC file: %s. File may be corrupted or incorrectly named.", sanitizedName),
				})
				return
			}

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
		output, err := beets.ImportPath(ctx, req.Path)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			errorMessage := parseBeetErrorMessage(output, err)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error":   errorMessage,
				"details": output,
			})
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

// parseBeetErrorMessage extracts meaningful errors from beets output
func parseBeetErrorMessage(output string, err error) string {
	if output == "" {
		return err.Error()
	}

	// Common beets error patterns
	patterns := map[string]string{
		"No such file or directory":     "File not found - files may have been moved or deleted",
		"could not read file":            "Invalid or corrupted audio file",
		"FFmpeg error":                   "Audio decoding failed - file may be corrupted",
		"MusicBrainz API error":          "Unable to reach MusicBrainz - check internet connection",
		"no matches found":               "Could not find metadata match for this album",
		"unmatched tracks":               "Some tracks could not be matched to album",
		"Permission denied":              "Permission error accessing files",
		"disk full":                      "Not enough disk space",
	}

	lowerOutput := strings.ToLower(output)
	for pattern, message := range patterns {
		if strings.Contains(lowerOutput, strings.ToLower(pattern)) {
			return message
		}
	}

	// Extract first meaningful line from output
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" && !strings.HasPrefix(trimmed, "beet:") {
			// Truncate if too long
			if len(trimmed) > 200 {
				return trimmed[:200] + "..."
			}
			return trimmed
		}
	}

	return fmt.Sprintf("Import failed: %v", err)
}

// isValidFLACFile checks if file has valid FLAC magic bytes (0x664C6143 = "fLaC")
func isValidFLACFile(file multipart.File) bool {
	magicBytes := make([]byte, 4)
	n, err := file.Read(magicBytes)
	if err != nil || n != 4 {
		return false
	}

	// Reset file pointer for subsequent reads
	file.Seek(0, 0)

	return magicBytes[0] == 0x66 && magicBytes[1] == 0x4C &&
		magicBytes[2] == 0x61 && magicBytes[3] == 0x43
}
