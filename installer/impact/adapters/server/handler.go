// Package server supplies a testable handler, not a server lifecycle or loop.
package server

import (
	"encoding/json"
	"impact/adapters/local"
	"impact/internal/evaluation"
	"net/http"
)

func Handler(engine *evaluation.Engine) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST")
			w.WriteHeader(http.StatusMethodNotAllowed)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "POST required"})
			return
		}
		a, err := local.Evaluate(engine, r.Body)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		_ = json.NewEncoder(w).Encode(a)
	})
}
