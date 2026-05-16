package extensions

import (
	"log"
	"time"
)

// DownloadWorker processes the download queue in the background
type DownloadWorker struct {
	downloadService *DownloadService
	stopChan        chan struct{}
	interval        time.Duration
}

// NewDownloadWorker creates a new download worker
func NewDownloadWorker(downloadService *DownloadService) *DownloadWorker {
	return &DownloadWorker{
		downloadService: downloadService,
		stopChan:        make(chan struct{}),
		interval:        5 * time.Second,
	}
}

// Start starts the worker
func (w *DownloadWorker) Start() {
	go w.processLoop()
	log.Println("Download worker started")
}

// Stop stops the worker
func (w *DownloadWorker) Stop() {
	close(w.stopChan)
	log.Println("Download worker stopped")
}

// processLoop is the main worker loop
func (w *DownloadWorker) processLoop() {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := w.downloadService.ProcessQueue(); err != nil {
				log.Printf("Worker error: %v", err)
			}
		case <-w.stopChan:
			return
		}
	}
}
