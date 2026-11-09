package handler

import (
	"net/http"

	"sqlformys/internal/config"
	"sqlformys/internal/service"
	"sqlformys/pkg/database"
)

// NewRouter configura e retorna o roteador HTTP principal
func NewRouter(cfg *config.Config) *http.ServeMux {
	mux := http.NewServeMux()

	authHandler := NewAuthHandler(cfg)
	metaHandler := NewMetaHandler(cfg)

	// Inicializa o Motor de Queries Dinâmicas
	connector := database.NewConnector()
	querySvc := service.NewDynamicQueryService(connector)
	queryHandler := NewQueryHandler(querySvc)

	mux.HandleFunc("GET /api/auth/me", authHandler.Me)
	mux.HandleFunc("GET /api/version", metaHandler.Version)

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
