package handler

import (
	"fmt"
	"net/http"
)

type ProjectHandler struct {
	// projectService domain.ProjectService
}

func NewProjectHandler() *ProjectHandler {
	return &ProjectHandler{}
}

func (h *ProjectHandler) List(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, "Endpoint de Listar Projetos")
}

func (h *ProjectHandler) Create(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, "Endpoint de Criar Projeto")
}
