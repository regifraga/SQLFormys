package handler

import (
	"fmt"
	"net/http"
)

type FormHandler struct {
	// formService service.FormService
	// queryService domain.QueryService
}

func NewFormHandler() *FormHandler {
	return &FormHandler{}
}

func (h *FormHandler) GetForm(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("project_id")
	table := r.PathValue("table")
	fmt.Fprintf(w, "Endpoint para Gerar Formulário dinâmico da tabela %s do projeto %s\n", table, projectID)
}

func (h *FormHandler) SubmitForm(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("project_id")
	table := r.PathValue("table")
	fmt.Fprintf(w, "Endpoint para Processar Submissão do formulário na tabela %s do projeto %s\n", table, projectID)
}
