package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"sqlformys/internal/config"
	"sqlformys/internal/handler"
	"sqlformys/pkg/database"
)

// corsMiddleware adiciona os headers necessários para requisições cross-origin
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// responseWriterWrapper captura o status HTTP da resposta
type responseWriterWrapper struct {
	http.ResponseWriter
	statusCode int
}

func (w *responseWriterWrapper) WriteHeader(code int) {
	w.statusCode = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *responseWriterWrapper) Write(b []byte) (int, error) {
	if w.statusCode == 0 {
		w.statusCode = http.StatusOK
	}
	return w.ResponseWriter.Write(b)
}

// loggingMiddleware registra os detalhes de cada requisição HTTP recebida
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		wrapper := &responseWriterWrapper{ResponseWriter: w}

		next.ServeHTTP(wrapper, r)

		if wrapper.statusCode == 0 {
			wrapper.statusCode = http.StatusOK
		}

		duration := time.Since(start)
		log.Printf("[%s] %s %s de %s - Status: %d - Duração: %v",
			r.Method,
			r.RequestURI,
			r.Proto,
			r.RemoteAddr,
			wrapper.statusCode,
			duration,
		)
	})
}

func main() {
	// Carrega configurações
	cfg := config.Load()

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
	router := handler.NewRouter()

	fmt.Printf("Servidor iniciado na porta %s (Ambiente: %s)\n", cfg.Port, cfg.Environment)
	if err := http.ListenAndServe(":"+cfg.Port, corsMiddleware(loggingMiddleware(router))); err != nil {
		log.Fatalf("Erro ao iniciar o servidor: %v", err)
	}
}
