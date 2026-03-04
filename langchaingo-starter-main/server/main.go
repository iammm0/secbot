// Server: HTTP API for all agent design patterns.
//
// Usage: go run ./server/
//
// Endpoints:
//   GET  /api/patterns     - List available patterns
//   POST /api/run          - Execute a pattern
//   POST /api/run/stream   - Execute with SSE streaming
//
// Request body for /api/run:
//   {"pattern": "reflection", "input": "...", "options": {"max_iterations": 3}}
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"langchaingo-starter/config"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()

	server, err := NewServer(cfg)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/patterns", server.handlePatterns)
	mux.HandleFunc("/api/run", server.handleRun)
	mux.HandleFunc("/api/run/stream", server.handleStream)

	// Health check
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Root
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"service":   "langchaingo-starter",
			"version":   "1.0.0",
			"docs":      "GET /api/patterns for available patterns",
			"run":       "POST /api/run with {\"pattern\": \"...\", \"input\": \"...\"}",
			"stream":    "POST /api/run/stream for SSE streaming",
			"health":    "GET /health",
		})
	})

	// Apply middleware
	handler := chain(mux, recoveryMiddleware, corsMiddleware, loggingMiddleware)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	addr := fmt.Sprintf(":%s", port)
	log.Printf("Starting server on %s (provider=%s, model=%s)", addr, cfg.LLMProvider, cfg.ModelName)
	log.Printf("Endpoints: GET /api/patterns | POST /api/run | POST /api/run/stream")

	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
