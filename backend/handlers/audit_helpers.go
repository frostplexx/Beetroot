package handlers

import (
	"context"
	"database/sql"
	"time"

	"backend/audit"
	"backend/beets"
)

// LogAlbumAction logs an action on an album
func LogAlbumAction(ctx context.Context, action audit.ActionType, albumID int64, albumName string, details map[string]interface{}, success bool, errorMsg string, duration time.Duration) {
	if auditLogger == nil {
		return
	}

	entry := audit.LogEntry{
		Action:     action,
		TargetType: "album",
		TargetID:   sql.NullInt64{Int64: albumID, Valid: true},
		TargetName: albumName,
		User:       "user",
		Details:    details,
		Success:    success,
		ErrorMsg:   errorMsg,
		Duration:   duration.Milliseconds(),
	}

	_ = auditLogger.Log(ctx, entry)
}

// LogItemAction logs an action on an item/track
func LogItemAction(ctx context.Context, action audit.ActionType, itemID int64, itemName string, details map[string]interface{}, success bool, errorMsg string, duration time.Duration) {
	if auditLogger == nil {
		return
	}

	entry := audit.LogEntry{
		Action:     action,
		TargetType: "item",
		TargetID:   sql.NullInt64{Int64: itemID, Valid: true},
		TargetName: itemName,
		User:       "user",
		Details:    details,
		Success:    success,
		ErrorMsg:   errorMsg,
		Duration:   duration.Milliseconds(),
	}

	_ = auditLogger.Log(ctx, entry)
}

// LogSystemAction logs a system-wide action
func LogSystemAction(ctx context.Context, action audit.ActionType, details map[string]interface{}, success bool, errorMsg string, duration time.Duration) {
	if auditLogger == nil {
		return
	}

	entry := audit.LogEntry{
		Action:     action,
		TargetType: "system",
		TargetName: string(action),
		User:       "system",
		Details:    details,
		Success:    success,
		ErrorMsg:   errorMsg,
		Duration:   duration.Milliseconds(),
	}

	_ = auditLogger.Log(ctx, entry)
}

// LogBeetsCommand logs a beets CLI command execution
func LogBeetsCommand(ctx context.Context, command string, args []string, output string, success bool, errorMsg string, duration time.Duration) {
	if auditLogger == nil {
		return
	}

	details := map[string]interface{}{
		"command": command,
		"args":    args,
	}
	if output != "" && len(output) < 500 {
		details["output"] = output
	}

	entry := audit.LogEntry{
		Action:     audit.ActionBeetsCommand,
		TargetType: "system",
		TargetName: "beet " + command,
		User:       "system",
		Details:    details,
		Success:    success,
		ErrorMsg:   errorMsg,
		Duration:   duration.Milliseconds(),
	}

	_ = auditLogger.Log(ctx, entry)
}

// GetAlbumName fetches album name for logging
func GetAlbumName(ctx context.Context, db *beets.DB, albumID int64) string {
	if db == nil {
		return "Unknown Album"
	}
	album, err := db.GetAlbumByID(ctx, albumID)
	if err != nil || album == nil {
		return "Unknown Album"
	}
	return album.AlbumArtist + " - " + album.Album
}

// GetItemName fetches item name for logging
func GetItemName(ctx context.Context, db *beets.DB, itemID int64) string {
	if db == nil {
		return "Unknown Track"
	}
	item, err := db.GetItemByID(ctx, itemID)
	if err != nil || item == nil {
		return "Unknown Track"
	}
	return item.Artist + " - " + item.Title
}
