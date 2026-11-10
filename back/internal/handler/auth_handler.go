package handler

import (
	"encoding/json"
	"net/http"

	"sqlformys/internal/accounts"
	"sqlformys/internal/auth"
	"sqlformys/internal/config"
	"sqlformys/internal/htpasswd"
)

type AuthHandler struct {
	cfg      *config.Config
	accounts *accounts.Service
}

func NewAuthHandler(cfg *config.Config, acc *accounts.Service) *AuthHandler {
	return &AuthHandler{cfg: cfg, accounts: acc}
}

type authMeResponse struct {
	Enabled            bool   `json:"enabled"`
	Username           string `json:"username"`
	DisplayName        string `json:"displayName"`
	IsAdmin            bool   `json:"isAdmin"`
	CanChangePassword  bool   `json:"canChangePassword"`
}

func (h *AuthHandler) enrichMe(id auth.Identity, enabled bool) authMeResponse {
	resp := authMeResponse{
		Enabled:     enabled,
		Username:    id.Username,
		DisplayName: id.DisplayName,
	}
	if h.accounts != nil {
		resp.CanChangePassword = h.accounts.CanChangePassword()
		resp.IsAdmin = h.accounts.IsAdmin(id.Username)
	}
	return resp
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	if !h.cfg.AuthEnabled {
		if id, ok := auth.IdentityFromRequest(r); ok {
			respondWithJSON(w, http.StatusOK, h.enrichMe(id, false))
			return
		}
		respondWithJSON(w, http.StatusOK, authMeResponse{Enabled: false})
		return
	}

	id, ok := auth.IdentityFromContext(r.Context())
	if !ok || id.Username == "" {
		respondWithError(w, http.StatusUnauthorized, "Autenticação de rede obrigatória")
		return
	}

	respondWithJSON(w, http.StatusOK, h.enrichMe(id, true))
}

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	id, ok := auth.IdentityFromRequest(r)
	if !ok || id.Username == "" {
		respondWithError(w, http.StatusUnauthorized, "Autenticação obrigatória")
		return
	}
	if h.accounts == nil || !h.accounts.CanChangePassword() {
		respondWithError(w, http.StatusServiceUnavailable, "Troca de senha indisponível")
		return
	}
	var body changePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondWithError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	if err := h.accounts.ChangeOwnPassword(id.Username, body.CurrentPassword, body.NewPassword); err != nil {
		code := http.StatusBadRequest
		if err.Error() == "senha atual incorreta" {
			code = http.StatusUnauthorized
		}
		if err == htpasswd.ErrNotConfigured {
			code = http.StatusServiceUnavailable
		}
		respondWithError(w, code, err.Error())
		return
	}
	respondWithJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func respondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(payload)
}
