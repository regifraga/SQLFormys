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

	// Inicializa o Motor de Queries Dinâmicas
	connector := database.NewConnector()
	querySvc := service.NewDynamicQueryService(connector)
	queryHandler := NewQueryHandler(querySvc)

	// Rotas de Autenticação
	mux.HandleFunc("POST /api/auth/login", authHandler.Login)
	mux.HandleFunc("POST /api/auth/register", authHandler.Register)

	// Rotas Dinâmicas do SQLFormys Engine (Suportando N níveis de subpastas)
	mux.HandleFunc("GET /api/projects", queryHandler.ListProjects)
	mux.HandleFunc("GET /api/queries/{filepath...}", queryHandler.GetMetadata)
	mux.HandleFunc("POST /api/queries/{filepath...}", queryHandler.ExecuteQuery)

	// Rota padrão para 404 (JSON)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		respondWithError(w, http.StatusNotFound, "Rota não encontrada")
	})

	return mux
}
