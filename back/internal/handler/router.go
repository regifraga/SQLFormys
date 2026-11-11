package handler

import (
	"net/http"

	"sqlformys/internal/accounts"
	"sqlformys/internal/config"
	"sqlformys/internal/service"
	"sqlformys/pkg/database"
)

// NewRouter configura e retorna o roteador HTTP principal
func NewRouter(cfg *config.Config, acc *accounts.Service) *http.ServeMux {
	mux := http.NewServeMux()

	authHandler := NewAuthHandler(cfg, acc)
	adminHandler := NewAdminHandler(cfg, acc)
	metaHandler := NewMetaHandler(cfg)

	// Inicializa o Motor de Queries Dinâmicas
	connector := database.NewConnector()
	querySvc := service.NewDynamicQueryService(connector)
	queryHandler := NewQueryHandler(querySvc, cfg, acc)

	mux.HandleFunc("GET /api/auth/me", authHandler.Me)
	mux.HandleFunc("POST /api/auth/password", authHandler.ChangePassword)
	mux.HandleFunc("GET /api/me/settings", authHandler.GetMySettings)
	mux.HandleFunc("PUT /api/me/settings", authHandler.PutMySettings)
	mux.HandleFunc("GET /api/version", metaHandler.Version)

	mux.HandleFunc("GET /api/admin/users", adminHandler.ListUsers)
	mux.HandleFunc("POST /api/admin/users", adminHandler.CreateUser)
	mux.HandleFunc("PUT /api/admin/users/{username}", adminHandler.UpdateUser)
	mux.HandleFunc("DELETE /api/admin/users/{username}", adminHandler.DeleteUser)
	mux.HandleFunc("GET /api/admin/sql/{filepath...}", adminHandler.GetSQL)
	mux.HandleFunc("PUT /api/admin/sql/{filepath...}", adminHandler.PutSQL)
	mux.HandleFunc("POST /api/admin/folders", adminHandler.CreateFolder)
	mux.HandleFunc("PATCH /api/admin/folders", adminHandler.RenameFolder)

	// Rotas Dinâmicas do SQLFormys Engine (Suportando N níveis de subpastas)
	mux.HandleFunc("GET /api/projects", queryHandler.ListProjects)
	mux.HandleFunc("GET /api/queries/{filepath...}", queryHandler.GetMetadata)
	mux.HandleFunc("POST /api/queries/{filepath...}", queryHandler.ExecuteQuery)
	mux.HandleFunc("POST /api/lookups/{filepath...}", queryHandler.ExecuteLookup)

	// Rota padrão para 404 (JSON)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		respondWithError(w, http.StatusNotFound, "Rota não encontrada")
	})

	return mux
}
