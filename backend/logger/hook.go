package logger

import (
	"github.com/rs/zerolog"
)

// BufferHook is a zerolog hook that writes to the log buffer
type BufferHook struct {
	buffer *LogBuffer
}

// NewBufferHook creates a new buffer hook
func NewBufferHook(buffer *LogBuffer) *BufferHook {
	return &BufferHook{buffer: buffer}
}

// Run implements the zerolog.Hook interface
func (h *BufferHook) Run(e *zerolog.Event, level zerolog.Level, msg string) {
	// Create log entry
	entry := LogEntry{
		Level:   level.String(),
		Message: msg,
		Fields:  make(map[string]interface{}),
	}

	// Add to buffer
	h.buffer.Add(entry)
}
