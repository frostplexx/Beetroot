package logger

import (
	"sync"
	"time"
)

// LogEntry represents a single log entry
type LogEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Level     string    `json:"level"`
	Message   string    `json:"message"`
	Fields    map[string]interface{} `json:"fields,omitempty"`
}

// LogBuffer stores recent log entries in memory
type LogBuffer struct {
	entries []LogEntry
	maxSize int
	mu      sync.RWMutex
}

// NewLogBuffer creates a new log buffer with the specified max size
func NewLogBuffer(maxSize int) *LogBuffer {
	return &LogBuffer{
		entries: make([]LogEntry, 0, maxSize),
		maxSize: maxSize,
	}
}

// Add adds a new log entry to the buffer
func (b *LogBuffer) Add(entry LogEntry) {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Add timestamp if not set
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now()
	}

	// Add to buffer
	b.entries = append(b.entries, entry)

	// Keep only the last maxSize entries
	if len(b.entries) > b.maxSize {
		b.entries = b.entries[len(b.entries)-b.maxSize:]
	}
}

// GetAll returns all log entries
func (b *LogBuffer) GetAll() []LogEntry {
	b.mu.RLock()
	defer b.mu.RUnlock()

	// Return a copy to avoid race conditions
	result := make([]LogEntry, len(b.entries))
	copy(result, b.entries)
	return result
}

// GetRecent returns the last n log entries
func (b *LogBuffer) GetRecent(n int) []LogEntry {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if n >= len(b.entries) {
		result := make([]LogEntry, len(b.entries))
		copy(result, b.entries)
		return result
	}

	result := make([]LogEntry, n)
	copy(result, b.entries[len(b.entries)-n:])
	return result
}

// Clear clears all log entries
func (b *LogBuffer) Clear() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.entries = make([]LogEntry, 0, b.maxSize)
}

// Global log buffer instance
var globalBuffer *LogBuffer

// InitGlobalBuffer initializes the global log buffer
func InitGlobalBuffer(maxSize int) {
	globalBuffer = NewLogBuffer(maxSize)
}

// GetGlobalBuffer returns the global log buffer
func GetGlobalBuffer() *LogBuffer {
	if globalBuffer == nil {
		InitGlobalBuffer(1000)
	}
	return globalBuffer
}

// AddLog adds a log entry to the global buffer
func AddLog(level, message string, fields map[string]interface{}) {
	GetGlobalBuffer().Add(LogEntry{
		Timestamp: time.Now(),
		Level:     level,
		Message:   message,
		Fields:    fields,
	})
}
