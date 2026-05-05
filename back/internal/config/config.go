package config

import (
	"os"
)

// Config armazena as configurações da aplicação
type Config struct {
	Port     string
	DBDriver string
	DBDsn    string
	// Adicionar configurações de JWT aqui futuramente
}

// Load carrega as variáveis de ambiente ou define valores padrão
func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbDriver := os.Getenv("DB_DRIVER")
	if dbDriver == "" {
		dbDriver = "sqlserver"
	}

	dbDsn := os.Getenv("DB_DSN")
	if dbDsn == "" {
		// Padrão para testes locais com a porta 1433 exposta pelo docker-compose
		dbDsn = "sqlserver://sa:SqlFormys@12345@localhost:1433?database=master&encrypt=disable"
	}

	return &Config{
		Port:     port,
		DBDriver: dbDriver,
		DBDsn:    dbDsn,
	}
}
