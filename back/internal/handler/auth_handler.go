package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"sqlformys/internal/accounts"
	"sqlformys/internal/auth"
	"sqlformys/internal/config"
	"sqlformys/internal/htpasswd"
	"sqlformys/internal/usersettings"
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

func (h *AuthHandler) GetMySettings(w http.ResponseWriter, r *http.Request) {
	id, ok := auth.IdentityFromRequest(r)
	if !ok || id.Username == "" {
		respondWithError(w, http.StatusUnauthorized, "Autenticação obrigatória")
		return
	}
	store := h.accounts.UserSettings()
	if store == nil || !store.Available() {
		respondWithError(w, http.StatusServiceUnavailable, "Preferências indisponíveis")
		return
	}
	settings, err := store.Get(id.Username)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondWithJSON(w, http.StatusOK, settings)
}

type patchSettingsRequest struct {
	Favorites       *[]string `json:"favorites"`
	Theme           *string   `json:"theme"`
	SidebarExpanded *[]string `json:"sidebarExpanded"`
	SidebarWidth    *int      `json:"sidebarWidth"`
}

func (h *AuthHandler) PutMySettings(w http.ResponseWriter, r *http.Request) {
	id, ok := auth.IdentityFromRequest(r)
	if !ok || id.Username == "" {
		respondWithError(w, http.StatusUnauthorized, "Autenticação obrigatória")
		return
	}
	store := h.accounts.UserSettings()
	if store == nil || !store.Available() {
		respondWithError(w, http.StatusServiceUnavailable, "Preferências indisponíveis")
		return
	}
	var body patchSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondWithError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	partial := usersettings.Settings{}
	patchFav, patchTheme, patchSide, patchWidth := false, false, false, false
	if body.Favorites != nil {
		partial.Favorites = *body.Favorites
		patchFav = true
	}
	if body.Theme != nil {
		partial.Theme = strings.TrimSpace(*body.Theme)
		patchTheme = true
	}
	if body.SidebarExpanded != nil {
		partial.SidebarExpanded = *body.SidebarExpanded
		patchSide = true
	}
	if body.SidebarWidth != nil {
		w := *body.SidebarWidth
		const sidebarWidthMinStore = 280
		const sidebarWidthMax = 600
		if w < sidebarWidthMinStore {
			w = sidebarWidthMinStore
		}
		if w > sidebarWidthMax {
			w = sidebarWidthMax
		}
		partial.SidebarWidth = w
		patchWidth = true
	}
	if !patchFav && !patchTheme && !patchSide && !patchWidth {
		settings, err := store.Get(id.Username)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, err.Error())
			return
		}
		respondWithJSON(w, http.StatusOK, settings)
		return
	}
	settings, err := store.Patch(id.Username, partial, patchFav, patchTheme, patchSide, patchWidth)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondWithJSON(w, http.StatusOK, settings)
}

func respondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(payload)
}
