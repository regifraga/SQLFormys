package handler

import (
	"fmt"
	"net/http"
)

type SchemaHandler struct {
	// schemaRepo repository.SchemaRepository
}

func NewSchemaHandler() *SchemaHandler {
	return &SchemaHandler{}
}

func (h *SchemaHandler) ListTables(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("id")
	fmt.Fprintf(w, "Endpoint de Listar Tabelas do Projeto: %s\n", projectID)
}

func (h *SchemaHandler) GetTableStructure(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("id")
	table := r.PathValue("table")
	fmt.Fprintf(w, "Endpoint de Buscar Estrutura da Tabela %s do Projeto %s\n", table, projectID)
}
