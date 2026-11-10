package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"sqlformys/internal/accounts"
	"sqlformys/internal/auth"
	"sqlformys/internal/config"
	"sqlformys/internal/htpasswd"
	"sqlformys/internal/service"
)

type AdminHandler struct {
	cfg      *config.Config
	accounts *accounts.Service
	content  *service.ContentAdmin
}

func NewAdminHandler(cfg *config.Config, acc *accounts.Service) *AdminHandler {
	return &AdminHandler{
		cfg:      cfg,
		accounts: acc,
		content:  service.NewContentAdmin(),
	}
}

func (h *AdminHandler) requireAdmin(w http.ResponseWriter, r *http.Request) (auth.Identity, bool) {
	id, ok := auth.IdentityFromRequest(r)
	if !ok || id.Username == "" {
		respondWithError(w, http.StatusUnauthorized, "Autenticação obrigatória")
		return auth.Identity{}, false
	}
	if h.accounts == nil || !h.accounts.IsAdmin(id.Username) {
		respondWithError(w, http.StatusForbidden, "Acesso restrito a administradores")
		return auth.Identity{}, false
	}
	return id, true
}

func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	if h.accounts == nil {
		respondWithError(w, http.StatusServiceUnavailable, "Gestão de usuários indisponível")
		return
	}
	users, err := h.accounts.ListUsers()
	if err != nil {
		if err == htpasswd.ErrNotConfigured {
			respondWithError(w, http.StatusServiceUnavailable, "htpasswd não configurado")
			return
		}
		respondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondWithJSON(w, http.StatusOK, map[string]interface{}{"users": users})
}

type createUserRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Admin    bool   `json:"admin"`
}

func (h *AdminHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	var body createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondWithError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	if err := h.accounts.CreateUser(body.Username, body.Password, body.Admin); err != nil {
		code := http.StatusBadRequest
		if err == htpasswd.ErrUserExists {
			code = http.StatusConflict
		}
		respondWithError(w, code, err.Error())
		return
	}
	respondWithJSON(w, http.StatusCreated, map[string]string{"status": "ok"})
}

type updateUserRequest struct {
	Username    string `json:"username"`
	Password    string `json:"password"`
	Admin       *bool  `json:"admin"`
}

func (h *AdminHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireAdmin(w, r)
	if !ok {
		return
	}
	existing := strings.TrimSpace(r.PathValue("username"))
	if existing == "" {
		respondWithError(w, http.StatusBadRequest, "usuário obrigatório")
		return
	}
	var body updateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondWithError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	newName := strings.TrimSpace(body.Username)
	if newName == "" {
		newName = existing
	}
	if body.Admin != nil && !*body.Admin && auth.NormalizeLogin(existing) == auth.NormalizeLogin(actor.Username) {
		respondWithError(w, http.StatusBadRequest, "não é permitido rebaixar o próprio perfil")
		return
	}
	if err := h.accounts.UpdateUser(existing, newName, body.Password, body.Admin); err != nil {
		respondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	respondWithJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *AdminHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireAdmin(w, r)
	if !ok {
		return
	}
	username := strings.TrimSpace(r.PathValue("username"))
	if username == "" {
		respondWithError(w, http.StatusBadRequest, "usuário obrigatório")
		return
	}
	if err := h.accounts.DeleteUser(username, actor.Username); err != nil {
		respondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	respondWithJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *AdminHandler) GetSQL(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	rel := strings.TrimSpace(r.PathValue("filepath"))
	if rel == "" {
		respondWithError(w, http.StatusBadRequest, "caminho obrigatório")
		return
	}
	content, err := h.content.ReadSQL(h.cfg.QueriesBasePath, rel)
	if err != nil {
		respondWithError(w, http.StatusNotFound, err.Error())
		return
	}
	respondWithJSON(w, http.StatusOK, map[string]string{"path": rel, "content": content})
}

func (h *AdminHandler) PutSQL(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	rel := strings.TrimSpace(r.PathValue("filepath"))
	if rel == "" {
		respondWithError(w, http.StatusBadRequest, "caminho obrigatório")
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "corpo inválido")
		return
	}
	var payload struct {
		Content string `json:"content"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		payload.Content = string(body)
	}
	if err := h.content.WriteSQL(h.cfg.QueriesBasePath, rel, payload.Content); err != nil {
		respondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	respondWithJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type folderCreateRequest struct {
	Path string `json:"path"`
}

func (h *AdminHandler) CreateFolder(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	var body folderCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondWithError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	if err := h.content.CreateFolder(h.cfg.QueriesBasePath, body.Path); err != nil {
		respondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	respondWithJSON(w, http.StatusCreated, map[string]string{"status": "ok"})
}

type folderRenameRequest struct {
	From string `json:"from"`
	To   string `json:"to"`
}

func (h *AdminHandler) RenameFolder(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	var body folderRenameRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondWithError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	if err := h.content.RenameFolder(h.cfg.QueriesBasePath, body.From, body.To); err != nil {
		respondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	respondWithJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
