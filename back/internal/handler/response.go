package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"sqlformys/internal/domain"
	"unicode"
)

func respondWithError(w http.ResponseWriter, code int, message string, debug ...string) {
	// Capitaliza a primeira letra para uma mensagem mais amigável
	if len(message) > 0 {
		r := []rune(message)
		r[0] = unicode.ToUpper(r[0])
		message = string(r)
	}

	// Registra o erro nos logs do servidor
	if len(debug) > 0 && debug[0] != "" {
		log.Printf("[API ERROR] Status %d: %s | Query: %s", code, message, debug[0])
	} else {
		log.Printf("[API ERROR] Status %d: %s", code, message)
	}

	apiErr := domain.APIError{
		Error: message,
	}

	if len(debug) > 0 && debug[0] != "" {
		apiErr.DebugQuery = debug[0]
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(apiErr)
}
