package middleware

import (
	"net/http"
	"os"
	"strings"
)

// EnableCORS adds CORS headers to all responses
// By default allows localhost origins only. Set BEETROOT_ALLOWED_ORIGINS env var
// to specify custom origins (comma-separated)
func EnableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		// Get allowed origins from environment or use secure defaults
		allowedOrigins := getAllowedOrigins()

		// Check if origin is allowed
		allowed := false
		for _, allowedOrigin := range allowedOrigins {
			if origin == allowedOrigin {
				allowed = true
				break
			}
		}

		if allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		} else if origin == "" {
			// Allow same-origin requests (no Origin header)
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "3600")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// getAllowedOrigins returns the list of allowed origins for CORS
func getAllowedOrigins() []string {
	// Check environment variable first
	if envOrigins := os.Getenv("BEETROOT_ALLOWED_ORIGINS"); envOrigins != "" {
		return strings.Split(envOrigins, ",")
	}

	// Default: only allow localhost origins for development
	return []string{
		"http://localhost:5173",
		"http://localhost:4433",
		"http://127.0.0.1:5173",
		"http://127.0.0.1:4433",
	}
}
