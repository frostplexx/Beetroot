package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "modernc.org/sqlite"

	"github.com/rs/zerolog/log"
)

// ActionType represents the type of action performed
type ActionType string

const (
	ActionModifyAlbum      ActionType = "modify_album"
	ActionModifyItem       ActionType = "modify_item"
	ActionRefetchMetadata  ActionType = "refetch_metadata"
	ActionRefetchArt       ActionType = "refetch_art"
	ActionFetchLyrics      ActionType = "fetch_lyrics"
	ActionDeleteAlbum      ActionType = "delete_album"
	ActionDeleteItem       ActionType = "delete_item"
	ActionDeleteArtist     ActionType = "delete_artist"
	ActionUpload           ActionType = "upload"
	ActionImport           ActionType = "import"
	ActionMergeDuplicates  ActionType = "merge_duplicates"
	ActionFetchArt         ActionType = "fetch_art"
	ActionReplayGain       ActionType = "replaygain"
	ActionBeetsCommand     ActionType = "beets_command"
)

// LogEntry represents a single audit log entry
type LogEntry struct {
	ID          int64                  `json:"id"`
	Timestamp   time.Time              `json:"timestamp"`
	Action      ActionType             `json:"action"`
	TargetType  string                 `json:"target_type"` // "album", "item", "artist", "system"
	TargetID    sql.NullInt64          `json:"target_id"`
	TargetName  string                 `json:"target_name"`
	User        string                 `json:"user"` // "user" or "system"
	Details     map[string]interface{} `json:"details"`
	Success     bool                   `json:"success"`
	ErrorMsg    string                 `json:"error_msg,omitempty"`
	Duration    int64                  `json:"duration_ms"` // milliseconds
}

// Logger handles audit logging to SQLite
type Logger struct {
	db *sql.DB
}

// NewLogger creates a new audit logger
func NewLogger(dbPath string) (*Logger, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open audit database: %w", err)
	}

	// Create audit_log table if it doesn't exist
	schema := `
	CREATE TABLE IF NOT EXISTS audit_log (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		action TEXT NOT NULL,
		target_type TEXT NOT NULL,
		target_id INTEGER,
		target_name TEXT,
		user TEXT NOT NULL,
		details TEXT,
		success INTEGER NOT NULL,
		error_msg TEXT,
		duration_ms INTEGER
	);
	CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
	CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
	CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_type, target_id);
	`

	if _, err := db.Exec(schema); err != nil {
		return nil, fmt.Errorf("failed to create audit schema: %w", err)
	}

	return &Logger{db: db}, nil
}

// Log writes an audit log entry
func (l *Logger) Log(ctx context.Context, entry LogEntry) error {
	// Set timestamp if not provided
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now()
	}

	// Default user to "system" if not specified
	if entry.User == "" {
		entry.User = "system"
	}

	// Serialize details to JSON
	var detailsJSON []byte
	var err error
	if entry.Details != nil {
		detailsJSON, err = json.Marshal(entry.Details)
		if err != nil {
			log.Warn().Err(err).Msg("Failed to marshal audit log details")
			detailsJSON = []byte("{}")
		}
	}

	query := `
		INSERT INTO audit_log (timestamp, action, target_type, target_id, target_name, user, details, success, error_msg, duration_ms)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	var targetID interface{}
	if entry.TargetID.Valid {
		targetID = entry.TargetID.Int64
	}

	_, err = l.db.ExecContext(ctx, query,
		entry.Timestamp,
		entry.Action,
		entry.TargetType,
		targetID,
		entry.TargetName,
		entry.User,
		string(detailsJSON),
		entry.Success,
		entry.ErrorMsg,
		entry.Duration,
	)

	if err != nil {
		log.Error().Err(err).Msg("Failed to write audit log entry")
		return err
	}

	log.Debug().
		Str("action", string(entry.Action)).
		Str("target", entry.TargetName).
		Bool("success", entry.Success).
		Msg("Audit log entry written")

	return nil
}

// GetLogs retrieves audit logs with pagination and filtering
func (l *Logger) GetLogs(ctx context.Context, opts QueryOptions) ([]LogEntry, error) {
	query := `
		SELECT id, timestamp, action, target_type, target_id, target_name, user, details, success, error_msg, duration_ms
		FROM audit_log
		WHERE 1=1
	`
	args := []interface{}{}

	// Add filters
	if opts.Action != "" {
		query += " AND action = ?"
		args = append(args, opts.Action)
	}
	if opts.TargetType != "" {
		query += " AND target_type = ?"
		args = append(args, opts.TargetType)
	}
	if opts.TargetID > 0 {
		query += " AND target_id = ?"
		args = append(args, opts.TargetID)
	}
	if !opts.StartTime.IsZero() {
		query += " AND timestamp >= ?"
		args = append(args, opts.StartTime)
	}
	if !opts.EndTime.IsZero() {
		query += " AND timestamp <= ?"
		args = append(args, opts.EndTime)
	}

	// Order and pagination
	query += " ORDER BY timestamp DESC"
	if opts.Limit > 0 {
		query += " LIMIT ?"
		args = append(args, opts.Limit)
	}
	if opts.Offset > 0 {
		query += " OFFSET ?"
		args = append(args, opts.Offset)
	}

	rows, err := l.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []LogEntry
	for rows.Next() {
		var entry LogEntry
		var detailsJSON sql.NullString
		var errorMsg sql.NullString

		err := rows.Scan(
			&entry.ID,
			&entry.Timestamp,
			&entry.Action,
			&entry.TargetType,
			&entry.TargetID,
			&entry.TargetName,
			&entry.User,
			&detailsJSON,
			&entry.Success,
			&errorMsg,
			&entry.Duration,
		)
		if err != nil {
			log.Warn().Err(err).Msg("Failed to scan audit log row")
			continue
		}

		// Parse details JSON
		if detailsJSON.Valid && detailsJSON.String != "" {
			if err := json.Unmarshal([]byte(detailsJSON.String), &entry.Details); err != nil {
				log.Warn().Err(err).Msg("Failed to unmarshal audit log details")
			}
		}

		if errorMsg.Valid {
			entry.ErrorMsg = errorMsg.String
		}

		entries = append(entries, entry)
	}

	return entries, nil
}

// GetLogCount returns the total count of logs matching filters
func (l *Logger) GetLogCount(ctx context.Context, opts QueryOptions) (int64, error) {
	query := "SELECT COUNT(*) FROM audit_log WHERE 1=1"
	args := []interface{}{}

	if opts.Action != "" {
		query += " AND action = ?"
		args = append(args, opts.Action)
	}
	if opts.TargetType != "" {
		query += " AND target_type = ?"
		args = append(args, opts.TargetType)
	}
	if opts.TargetID > 0 {
		query += " AND target_id = ?"
		args = append(args, opts.TargetID)
	}
	if !opts.StartTime.IsZero() {
		query += " AND timestamp >= ?"
		args = append(args, opts.StartTime)
	}
	if !opts.EndTime.IsZero() {
		query += " AND timestamp <= ?"
		args = append(args, opts.EndTime)
	}

	var count int64
	err := l.db.QueryRowContext(ctx, query, args...).Scan(&count)
	return count, err
}

// Close closes the audit logger database connection
func (l *Logger) Close() error {
	if l.db != nil {
		return l.db.Close()
	}
	return nil
}

// QueryOptions for filtering audit logs
type QueryOptions struct {
	Action     ActionType
	TargetType string
	TargetID   int64
	StartTime  time.Time
	EndTime    time.Time
	Limit      int
	Offset     int
}
