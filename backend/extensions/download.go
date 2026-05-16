package extensions

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// DownloadService manages the download queue
type DownloadService struct {
	db            *ExtensionDB
	searchService *SearchService
	tempDir       string
	httpClient    *http.Client
}

// NewDownloadService creates a new download service
func NewDownloadService(db *ExtensionDB, searchService *SearchService, tempDir string) *DownloadService {
	// Create temp directory if it doesn't exist
	os.MkdirAll(tempDir, 0755)

	return &DownloadService{
		db:            db,
		searchService: searchService,
		tempDir:       tempDir,
		httpClient:    &http.Client{Timeout: 10 * time.Minute},
	}
}

// QueueDownload adds a download to the queue
func (ds *DownloadService) QueueDownload(result SearchResult, autoImport bool) (int64, error) {
	item := DownloadQueueItem{
		ExtensionID: sql.NullInt64{Int64: result.ExtensionID, Valid: true},
		URL:         result.URL,
		Title:       result.Title,
		Artist:      result.Artist,
		Album:       result.Album,
		Status:      "pending",
		AutoImport:  autoImport,
	}

	return ds.db.QueueDownload(item)
}

// ProcessQueue processes pending downloads
func (ds *DownloadService) ProcessQueue() error {
	// Get pending downloads
	items, err := ds.db.GetPendingDownloads()
	if err != nil {
		return err
	}

	// Process one at a time
	for _, item := range items {
		if err := ds.downloadItem(item); err != nil {
			log.Printf("Download failed for item %d: %v", item.ID, err)
		}
		// Only process one item per call to avoid blocking
		break
	}

	return nil
}

// downloadItem downloads a single item
func (ds *DownloadService) downloadItem(item DownloadQueueItem) error {
	ctx := context.Background()

	// Update status to downloading
	if err := ds.db.UpdateDownloadStatus(item.ID, "downloading", 0, "", ""); err != nil {
		return err
	}

	// Get extension
	if !item.ExtensionID.Valid {
		ds.db.UpdateDownloadStatus(item.ID, "failed", 0, "", "Extension not specified")
		return fmt.Errorf("extension not specified")
	}

	ext, err := ds.db.GetExtension(item.ExtensionID.Int64)
	if err != nil {
		ds.db.UpdateDownloadStatus(item.ID, "failed", 0, "", "Extension not found")
		return err
	}

	// Get runtime
	runtime, err := ds.searchService.getRuntime(*ext)
	if err != nil {
		ds.db.UpdateDownloadStatus(item.ID, "failed", 0, "", fmt.Sprintf("Failed to initialize extension: %v", err))
		return err
	}

	// Execute download function
	options := map[string]interface{}{
		"quality": "flac",
	}

	result, err := runtime.ExecuteDownload(ctx, item.URL, options)
	if err != nil {
		ds.db.UpdateDownloadStatus(item.ID, "failed", 0, "", fmt.Sprintf("Download function failed: %v", err))
		return err
	}

	// Extract download URL from result
	var downloadURL string
	if url, ok := result["url"].(string); ok {
		downloadURL = url
	} else if url, ok := result["download_url"].(string); ok {
		downloadURL = url
	} else {
		ds.db.UpdateDownloadStatus(item.ID, "failed", 0, "", "Extension did not return download URL")
		return fmt.Errorf("no download URL returned")
	}

	// Get filename
	filename := fmt.Sprintf("%s - %s.flac", item.Artist, item.Title)
	if filenameFromExt, ok := result["filename"].(string); ok {
		filename = filenameFromExt
	}

	// Sanitize filename
	filename = sanitizeFilename(filename)

	// Download file
	filePath := filepath.Join(ds.tempDir, filename)
	if err := ds.downloadFile(downloadURL, filePath, func(progress float64) {
		ds.db.UpdateDownloadStatus(item.ID, "downloading", progress, "", "")
	}); err != nil {
		ds.db.UpdateDownloadStatus(item.ID, "failed", 0, "", fmt.Sprintf("File download failed: %v", err))
		return err
	}

	// Update status to completed
	ds.db.UpdateDownloadStatus(item.ID, "completed", 1.0, filePath, "")

	// TODO: Auto-import to beets if requested
	// if item.AutoImport {
	//     ds.importToBeets(filePath)
	// }

	return nil
}

// downloadFile downloads a file from a URL
func (ds *DownloadService) downloadFile(url, filepath string, progressCallback func(float64)) error {
	resp, err := ds.httpClient.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, resp.Status)
	}

	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer out.Close()

	// Track progress
	var written int64
	contentLength := resp.ContentLength

	buffer := make([]byte, 32*1024) // 32KB buffer
	for {
		nr, err := resp.Body.Read(buffer)
		if nr > 0 {
			nw, errW := out.Write(buffer[0:nr])
			if errW != nil {
				return errW
			}
			if nr != nw {
				return io.ErrShortWrite
			}
			written += int64(nw)

			// Update progress
			if contentLength > 0 && progressCallback != nil {
				progress := float64(written) / float64(contentLength)
				progressCallback(progress)
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
	}

	return nil
}

// GetQueue returns the current download queue
func (ds *DownloadService) GetQueue() ([]DownloadQueueItem, error) {
	return ds.db.GetDownloadQueue()
}

// CancelDownload cancels a download
func (ds *DownloadService) CancelDownload(id int64) error {
	return ds.db.DeleteDownload(id)
}

// sanitizeFilename removes invalid characters from a filename
func sanitizeFilename(filename string) string {
	// Replace invalid characters
	invalid := []string{"/", "\\", ":", "*", "?", "\"", "<", ">", "|"}
	for _, char := range invalid {
		filename = replaceAll(filename, char, "_")
	}
	return filename
}

// replaceAll is a simple string replace helper
func replaceAll(s, old, new string) string {
	result := ""
	for i := 0; i < len(s); i++ {
		if i <= len(s)-len(old) && s[i:i+len(old)] == old {
			result += new
			i += len(old) - 1
		} else {
			result += string(s[i])
		}
	}
	return result
}
