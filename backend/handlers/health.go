package handlers

import (
	"encoding/json"
	"net/http"
)

// Response represents a basic JSON response
type Response struct {
	Message string `json:"message"`
	Status  string `json:"status"`
}

// HealthHandler returns health status
func HealthHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(Response{
			Message: "Backend is running!",
			Status:  "ok",
		})
	}
}

// APIHandler returns API status
func APIHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(Response{
			Message: "Hello from Go backend!",
			Status:  "success",
		})
	}
}
