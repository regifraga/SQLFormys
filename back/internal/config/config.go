package config

import (
	"log"
	"os"
	"strings"
)

// Config armazena as configurações da aplicação
type Config struct {
	Environment     string
	Port            string
	DBDriver        string
	DBDsn           string
	QueriesBasePath string
	// Adicionar configurações de JWT aqui futuramente
}

// Load carrega as variáveis de ambiente obrigatórias.
// Para rodar localmente, crie um arquivo .env na raiz do projeto
// (use .env.example como base) e exporte as variáveis antes de
// iniciar o servidor, ou suba via docker-compose que lê o .env
// automaticamente.
func Load() *Config {
	loadEnv(".env")

	env := os.Getenv("APP_ENV")
	if env == "" {
		env = "production"
	}

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
		log.Fatal("ERRO: variável de ambiente DB_DSN não definida. " +
			"Copie .env.example para .env e preencha com suas credenciais.")
	}

	queriesBasePath := os.Getenv("QUERIES_BASE_PATH")
	if queriesBasePath == "" {
		queriesBasePath = "queries"
	}

	return &Config{
		Environment:     env,
		Port:            port,
		DBDriver:        dbDriver,
		DBDsn:           dbDsn,
		QueriesBasePath: queriesBasePath,
	}
}

// loadEnv lê um arquivo .env simples e exporta as variáveis para o processo.
// Implementação manual para evitar dependências externas.
func loadEnv(filename string) {
	content, err := os.ReadFile(filename)
	if err != nil {
		return // Silenciosamente ignora se o arquivo não existir
	}

	lines := strings.Split(string(content), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		
		// Remove aspas simples ou duplas se existirem
		val = strings.Trim(val, `"'`)

		os.Setenv(key, val)
	}
}
