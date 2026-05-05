package handler

import (
	"encoding/json"
	"net/http"

	"sqlformys/internal/config"
	"sqlformys/internal/domain"
)

type QueryHandler struct {
	svc domain.DynamicQueryService
	cfg *config.Config
}

func NewQueryHandler(svc domain.DynamicQueryService) *QueryHandler {
	return &QueryHandler{
		svc: svc,
		cfg: config.Load(),
	}
}

func (h *QueryHandler) ListProjects(w http.ResponseWriter, r *http.Request) {
	// Base path onde as queries estão armazenadas localmente
	basePath := "queries"

	projects, err := h.svc.ListProjects(basePath)
	if err != nil {
		http.Error(w, "Erro ao listar projetos: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(projects)
}

func (h *QueryHandler) GetMetadata(w http.ResponseWriter, r *http.Request) {
	project := r.PathValue("project")
	module := r.PathValue("module")
	basePath := "queries"

	if project == "" || module == "" {
		http.Error(w, "Os parâmetros project e module são obrigatórios", http.StatusBadRequest)
		return
	}

	metadata, err := h.svc.GetMetadata(basePath, project, module)
	if err != nil {
		http.Error(w, "Erro ao buscar metadados: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metadata)
}

func (h *QueryHandler) ExecuteQuery(w http.ResponseWriter, r *http.Request) {
	project := r.PathValue("project")
	module := r.PathValue("module")
	basePath := "queries"

	if project == "" || module == "" {
		http.Error(w, "Os parâmetros project e module são obrigatórios", http.StatusBadRequest)
		return
	}

	// Payload enviado pelo frontend deve ser um objeto JSON ex: {"DT_INICIAL": "2026-04-01"}
	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Formato de payload inválido, experado JSON Object", http.StatusBadRequest)
		return
	}

	results, err := h.svc.ExecuteQuery(r.Context(), basePath, project, module, payload, h.cfg.DBDriver, h.cfg.DBDsn)
	if err != nil {
		http.Error(w, "Erro ao executar query: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}
