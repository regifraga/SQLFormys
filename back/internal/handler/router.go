package handler

import (
	"net/http"
)

// NewRouter configura e retorna o roteador HTTP principal
func NewRouter() *http.ServeMux {
	mux := http.NewServeMux()

	// Injeção de dependências seria feita aqui
	// Exemplo:
	// userRepo := repository.NewUserRepository()
	// authSvc := service.NewAuthService(userRepo)
	// authHandler := NewAuthHandler(authSvc)

	authHandler := NewAuthHandler()
	projectHandler := NewProjectHandler()
	schemaHandler := NewSchemaHandler()
	formHandler := NewFormHandler()

	// Rotas de Autenticação
	mux.HandleFunc("POST /api/auth/login", authHandler.Login)
	mux.HandleFunc("POST /api/auth/register", authHandler.Register)

	// Rotas de Projetos
	mux.HandleFunc("GET /api/projects", projectHandler.List)
	mux.HandleFunc("POST /api/projects", projectHandler.Create)
	mux.HandleFunc("GET /api/projects/{id}", projectHandler.Get)

	// Rotas de Schema e Banco de Dados
	mux.HandleFunc("GET /api/projects/{id}/tables", schemaHandler.ListTables)
	mux.HandleFunc("GET /api/projects/{id}/tables/{table}", schemaHandler.GetTableStructure)

	// Rotas de Formulários e Submissão
	mux.HandleFunc("GET /api/forms/{project_id}/{table}", formHandler.GetForm)
	mux.HandleFunc("POST /api/forms/{project_id}/{table}/submit", formHandler.SubmitForm)

	return mux
}
