package config

import (
	"os"
)

// Config armazena as configurações da aplicação
type Config struct {
	Port string
	// Adicionar configurações de banco de dados e JWT aqui futuramente
}

// Load carrega as variáveis de ambiente ou define valores padrão
func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	return &Config{
		Port: port,
	}
}
