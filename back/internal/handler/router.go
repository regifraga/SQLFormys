package handler

import (
	"net/http"

	"sqlformys/internal/service"
	"sqlformys/pkg/database"
)

// NewRouter configura e retorna o roteador HTTP principal
func NewRouter() *http.ServeMux {
	mux := http.NewServeMux()

	authHandler := NewAuthHandler()
	projectHandler := NewProjectHandler()
	schemaHandler := NewSchemaHandler()
	formHandler := NewFormHandler()

	// Inicializa o Motor de Queries Dinâmicas
	connector := database.NewConnector()
	querySvc := service.NewDynamicQueryService(connector)
	queryHandler := NewQueryHandler(querySvc)

	// Rotas de Autenticação
	mux.HandleFunc("POST /api/auth/login", authHandler.Login)
	mux.HandleFunc("POST /api/auth/register", authHandler.Register)

	// Rotas Dinâmicas do SQLFormys Engine (Substituindo a antiga listagem estática)
	mux.HandleFunc("GET /api/projects", queryHandler.ListProjects)
	mux.HandleFunc("GET /api/queries/{project}/{module}", queryHandler.GetMetadata)
	mux.HandleFunc("POST /api/queries/{project}/{module}", queryHandler.ExecuteQuery)

	// Rotas Estáticas Antigas (mantidas para compatibilidade se existirem)
	mux.HandleFunc("POST /api/projects", projectHandler.Create)
	mux.HandleFunc("GET /api/projects/{id}", projectHandler.Get)
	mux.HandleFunc("GET /api/projects/{id}/tables", schemaHandler.ListTables)
	mux.HandleFunc("GET /api/projects/{id}/tables/{table}", schemaHandler.GetTableStructure)
	mux.HandleFunc("GET /api/forms/{project_id}/{table}", formHandler.GetForm)
	mux.HandleFunc("POST /api/forms/{project_id}/{table}/submit", formHandler.SubmitForm)

	return mux
}
