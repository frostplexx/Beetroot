package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"backend/audit"
)

var auditLogger *audit.Logger

// InitAuditLogger initializes the global audit logger
func InitAuditLogger(dbPath string) error {
	var err error
	auditLogger, err = audit.NewLogger(dbPath)
	return err
}

// GetAuditLogger returns the global audit logger
func GetAuditLogger() *audit.Logger {
	return auditLogger
}

// AuditLogsHandler returns paginated audit logs
func AuditLogsHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if auditLogger == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Audit logging is not available",
			})
			return
		}

		// Parse query parameters
		limit := 100
		offset := 0
		if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
			if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 {
				limit = parsedLimit
			}
		}
		if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
			if parsedOffset, err := strconv.Atoi(offsetStr); err == nil && parsedOffset >= 0 {
				offset = parsedOffset
			}
		}

		opts := audit.QueryOptions{
			Limit:  limit,
			Offset: offset,
		}

		// Optional filters
		if action := r.URL.Query().Get("action"); action != "" {
			opts.Action = audit.ActionType(action)
		}
		if targetType := r.URL.Query().Get("target_type"); targetType != "" {
			opts.TargetType = targetType
		}
		if targetIDStr := r.URL.Query().Get("target_id"); targetIDStr != "" {
			if targetID, err := strconv.ParseInt(targetIDStr, 10, 64); err == nil {
				opts.TargetID = targetID
			}
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		logs, err := auditLogger.GetLogs(ctx, opts)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": err.Error(),
			})
			return
		}

		// Get total count
		count, err := auditLogger.GetLogCount(ctx, opts)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": err.Error(),
			})
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"logs":  logs,
			"total": count,
		})
	}
}

// AuditLogsByTargetHandler returns audit logs for a specific target
func AuditLogsByTargetHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if auditLogger == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Audit logging is not available",
			})
			return
		}

		targetType := r.URL.Query().Get("type")
		targetIDStr := r.URL.Query().Get("id")

		if targetType == "" || targetIDStr == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "target type and id are required",
			})
			return
		}

		targetID, err := strconv.ParseInt(targetIDStr, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "invalid target id",
			})
			return
		}

		opts := audit.QueryOptions{
			TargetType: targetType,
			TargetID:   targetID,
			Limit:      100,
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		logs, err := auditLogger.GetLogs(ctx, opts)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": err.Error(),
			})
			return
		}

		json.NewEncoder(w).Encode(logs)
	}
}

// AuditStatsHandler returns statistics about audit logs
func AuditStatsHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if auditLogger == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Audit logging is not available",
			})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		// Get total count
		total, err := auditLogger.GetLogCount(ctx, audit.QueryOptions{})
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": err.Error(),
			})
			return
		}

		// Get counts by action type
		actions := []audit.ActionType{
			audit.ActionModifyAlbum,
			audit.ActionModifyItem,
			audit.ActionRefetchMetadata,
			audit.ActionRefetchArt,
			audit.ActionDeleteAlbum,
			audit.ActionDeleteItem,
			audit.ActionBeetsCommand,
		}

		actionCounts := make(map[string]int64)
		for _, action := range actions {
			count, err := auditLogger.GetLogCount(ctx, audit.QueryOptions{Action: action})
			if err == nil {
				actionCounts[string(action)] = count
			}
		}

		// Get recent activity (last 24 hours)
		yesterday := time.Now().Add(-24 * time.Hour)
		recentCount, err := auditLogger.GetLogCount(ctx, audit.QueryOptions{
			StartTime: yesterday,
		})
		if err != nil {
			recentCount = 0
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"total":         total,
			"action_counts": actionCounts,
			"recent_24h":    recentCount,
		})
	}
}
