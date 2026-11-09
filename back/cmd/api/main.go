package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"sqlformys/internal/auth"
	"sqlformys/internal/config"
	"sqlformys/internal/handler"
	"sqlformys/internal/logging"
	"sqlformys/pkg/database"
)

// corsMiddleware adiciona os headers necessários para requisições cross-origin
func corsMiddleware(cfg *config.Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" {
			// credentials: 'include' no front exige origem explícita (não pode ser *).
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	// Carrega configurações
	cfg := config.Load()

	appLog, err := logging.Init(cfg)
	if err != nil {
		log.Fatalf("Falha ao inicializar logging: %v", err)
	}
	defer appLog.Close()
	log.SetOutput(appLog)
	log.SetFlags(log.LstdFlags)

	fmt.Printf("Tentando conectar ao banco de dados (%s)...\n", cfg.DBDriver)

	// Inicializa conexão com o banco
	connector := database.NewConnector()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	db, err := connector.Connect(ctx, cfg.DBDriver, cfg.DBDsn)
	if err != nil {
		log.Fatalf("Falha crítica: não foi possível conectar ao banco de dados: %v", err)
	}
	db.Close()

	fmt.Println("Conexão com o banco de dados estabelecida com sucesso!")

	// Configura o roteador principal usando a biblioteca padrão net/http
	router := handler.NewRouter(cfg)
	chain := auth.NewMiddleware(cfg, router)
	chain = logging.AccessMiddleware(appLog)(chain)
	chain = corsMiddleware(cfg, chain)

	if cfg.AuthEnabled {
		fmt.Printf("Autenticação de rede: ATIVADA (Ambiente: %s)\n", cfg.Environment)
	} else {
		fmt.Println("Autenticação de rede: desativada")
	}

	fmt.Printf("Servidor iniciado na porta %s (Ambiente: %s)\n", cfg.Port, cfg.Environment)
	if err := http.ListenAndServe(":"+cfg.Port, chain); err != nil {
		log.Fatalf("Erro ao iniciar o servidor: %v", err)
	}
}
