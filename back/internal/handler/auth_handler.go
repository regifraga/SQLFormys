package handler

import (
	"encoding/json"
	"net/http"

	"sqlformys/internal/auth"
	"sqlformys/internal/config"
)

type AuthHandler struct {
	cfg *config.Config
}

func NewAuthHandler(cfg *config.Config) *AuthHandler {
	return &AuthHandler{cfg: cfg}
}

type authMeResponse struct {
	Enabled     bool   `json:"enabled"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	if !h.cfg.AuthEnabled {
		if id, ok := auth.IdentityFromProxyHeaders(r); ok {
			respondWithJSON(w, http.StatusOK, authMeResponse{
				Enabled:     false,
				Username:    id.Username,
				DisplayName: id.DisplayName,
			})
			return
		}
		respondWithJSON(w, http.StatusOK, authMeResponse{
			Enabled:     false,
			Username:    "",
			DisplayName: "",
		})
		return
	}

	id, ok := auth.IdentityFromContext(r.Context())
	if !ok || id.Username == "" {
		respondWithError(w, http.StatusUnauthorized, "Autenticação de rede obrigatória")
		return
	}

	respondWithJSON(w, http.StatusOK, authMeResponse{
		Enabled:     true,
		Username:    id.Username,
		DisplayName: id.DisplayName,
	})
}

func respondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(payload)
}
