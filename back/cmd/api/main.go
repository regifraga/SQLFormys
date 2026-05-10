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
	defer db.Close()

	fmt.Println("Conexão com o banco de dados estabelecida com sucesso!")

	// Configura o roteador principal usando a biblioteca padrão net/http
	router := handler.NewRouter()

	fmt.Printf("Servidor iniciado na porta %s\n", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, router); err != nil {
		log.Fatalf("Erro ao iniciar o servidor: %v", err)
	}
}
