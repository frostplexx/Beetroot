package handlers

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

// sanitizeFilename removes path traversal attempts and dangerous characters
func sanitizeFilename(filename string) (string, error) {
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

	// Only allow alphanumeric, dash, underscore, dot, spaces, parentheses
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

// validatePathWithinBase ensures a path is within the allowed directory
func validatePathWithinBase(basePath, targetPath string) error {
	// Clean and resolve the paths
	cleanBase := filepath.Clean(basePath)
	cleanTarget := filepath.Clean(targetPath)

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
