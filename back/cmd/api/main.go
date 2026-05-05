package main

import (
	"fmt"
	"log"
	"net/http"

	"sqlformys/internal/config"
	"sqlformys/internal/handler"
)

func main() {
	// Carrega configurações
	cfg := config.Load()

	// Configura o roteador principal usando a biblioteca padrão net/http
	router := handler.NewRouter()

	fmt.Printf("Servidor iniciado na porta %s\n", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, router); err != nil {
		log.Fatalf("Erro ao iniciar o servidor: %v", err)
	}
}
