// Security validation and sanitization utilities

package security

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

// SanitizeFilename removes path traversal attempts and dangerous characters
func SanitizeFilename(filename string) (string, error) {
	// Remove any path components
	filename = filepath.Base(filename)

	// Check for empty or hidden files
	if filename == "" || filename == "." || filename == ".." || strings.HasPrefix(filename, ".") {
		return "", fmt.Errorf("invalid filename")
	}

	// Remove null bytes
	filename = strings.ReplaceAll(filename, "\x00", "")

	// Check for dangerous patterns
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		return "", fmt.Errorf("filename contains path traversal characters")
	}

	// Only allow alphanumeric, dash, underscore, dot
	matched, _ := regexp.MatchString(`^[a-zA-Z0-9._\-() ]+$`, filename)
	if !matched {
		return "", fmt.Errorf("filename contains invalid characters")
	}

	// Limit filename length
	if len(filename) > 255 {
		return "", fmt.Errorf("filename too long")
	}

	return filename, nil
}

// ValidatePath ensures a path is within the allowed directory
func ValidatePath(basePath, targetPath string) error {
	// Clean and resolve the paths
	cleanBase := filepath.Clean(basePath)
	cleanTarget := filepath.Clean(targetPath)

	// Make target absolute if it's relative
	if !filepath.IsAbs(cleanTarget) {
		cleanTarget = filepath.Join(cleanBase, cleanTarget)
	}

	// Check if target is within base
	relPath, err := filepath.Rel(cleanBase, cleanTarget)
	if err != nil {
		return fmt.Errorf("invalid path relationship")
	}

	// Ensure no path traversal
	if strings.HasPrefix(relPath, "..") || strings.Contains(relPath, "/../") {
		return fmt.Errorf("path traversal detected")
	}

	return nil
}

// SanitizeBeetsQuery removes dangerous characters from beets query strings
// Allows: alphanumeric, spaces, colons, quotes, parentheses, common operators
func SanitizeBeetsQuery(query string) (string, error) {
	if len(query) > 1000 {
		return "", fmt.Errorf("query too long")
	}

	// Remove null bytes
	query = strings.ReplaceAll(query, "\x00", "")

	// Check for shell metacharacters that could cause command injection
	dangerous := []string{";", "|", "&", "$", "`", "\n", "\r", "$(", "${"}
	for _, char := range dangerous {
		if strings.Contains(query, char) {
			return "", fmt.Errorf("query contains dangerous characters")
		}
	}

	return query, nil
}

// SanitizeMetadataValue sanitizes metadata field values
func SanitizeMetadataValue(value string) (string, error) {
	if len(value) > 10000 {
		return "", fmt.Errorf("value too long")
	}

	// Remove null bytes
	value = strings.ReplaceAll(value, "\x00", "")

	// Check for command injection patterns
	dangerous := []string{";", "|", "&", "$", "`", "$(", "${", "\n", "\r"}
	for _, char := range dangerous {
		if strings.Contains(value, char) {
			return "", fmt.Errorf("value contains dangerous characters")
		}
	}

	return value, nil
}

// ValidateMetadataField ensures field name is safe
func ValidateMetadataField(field string) error {
	// Only allow known beets fields (whitelist approach)
	allowedFields := map[string]bool{
		"album":           true,
		"albumartist":     true,
		"artist":          true,
		"title":           true,
		"year":            true,
		"month":           true,
		"day":             true,
		"genre":           true,
		"label":           true,
		"country":         true,
		"catalognum":      true,
		"barcode":         true,
		"albumtype":       true,
		"albumstatus":     true,
		"track":           true,
		"disc":            true,
		"comp":            true,
		"mb_albumid":      true,
		"mb_trackid":      true,
		"mb_releasegroupid": true,
	}

	if !allowedFields[field] {
		return fmt.Errorf("field not allowed: %s", field)
	}

	return nil
}

// ValidateID ensures IDs are positive integers
func ValidateID(id int64) error {
	if id <= 0 {
		return fmt.Errorf("invalid ID: must be positive")
	}
	if id > 9223372036854775807 {
		return fmt.Errorf("invalid ID: too large")
	}
	return nil
}
