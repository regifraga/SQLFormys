package config

import (
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Config armazena as configurações da aplicação
type Config struct {
	Environment     string
	Port            string
	DBDriver        string
	DBDsn           string
	QueriesBasePath string
	ProductName     string
	AuthEnabled     bool
	AuthDevUser     string
	AuthKrbKeytab   string
	AuthKrbSPN      string

	HtpasswdPath        string
	AdministratorsFile    string
	AdministratorsSeed    []string
	UserSettingsPath      string

	LogEnabled              bool
	LogDir                  string
	LogFile                 string
	LogRotation             string
	LogMaxSizeBytes         int64
	LogMaxFiles             int
	LogToStdout             bool
	LogRequestBodyMaxBytes  int
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

	productName := os.Getenv("PRODUCT_NAME")

	authEnabled := parseBoolEnv(os.Getenv("AUTH_ENABLED"), false)
	authDevUser := os.Getenv("AUTH_DEV_USER")
	authKrbKeytab := os.Getenv("AUTH_KRB_KEYTAB")
	authKrbSPN := os.Getenv("AUTH_KRB_SPN")

	htpasswdPath := strings.TrimSpace(os.Getenv("HTPASSWD_PATH"))
	administratorsFile := strings.TrimSpace(os.Getenv("ADMINISTRATORS_FILE"))
	administratorsSeed := parseCSVEnv(os.Getenv("ADMINISTRATORS"))
	if administratorsFile == "" && htpasswdPath != "" {
		administratorsFile = filepath.Join(filepath.Dir(htpasswdPath), "administrators")
	}

	userSettingsPath := strings.TrimSpace(os.Getenv("USER_SETTINGS_PATH"))
	if userSettingsPath == "" {
		if htpasswdPath != "" {
			userSettingsPath = filepath.Join(filepath.Dir(htpasswdPath), "user-settings")
		} else {
			userSettingsPath = "user-settings"
		}
	}

	logEnabled := parseBoolEnv(os.Getenv("LOG_ENABLED"), true)
	logDir := os.Getenv("LOG_DIR")
	if logDir == "" {
		logDir = "logs"
	}
	logFile := os.Getenv("LOG_FILE")
	if logFile == "" {
		logFile = "api.log"
	}
	logRotation := strings.ToLower(strings.TrimSpace(os.Getenv("LOG_ROTATION")))
	if logRotation == "" {
		logRotation = "size"
	}
	logMaxSizeMB := parseIntEnv(os.Getenv("LOG_MAX_SIZE_MB"), 10)
	if logMaxSizeMB < 1 {
		logMaxSizeMB = 10
	}
	logMaxFiles := parseIntEnv(os.Getenv("LOG_MAX_FILES"), 10)
	if logMaxFiles < 1 {
		logMaxFiles = 10
	}
	logToStdout := parseBoolEnv(os.Getenv("LOG_TO_STDOUT"), env == "development")
	logBodyMax := parseIntEnv(os.Getenv("LOG_REQUEST_BODY_MAX_BYTES"), 4096)
	if logBodyMax < 0 {
		logBodyMax = 0
	}

	if authEnabled && authDevUser == "" && (authKrbKeytab == "" || authKrbSPN == "") {
		if env == "development" {
			log.Fatal("ERRO: AUTH_ENABLED=true em development exige AUTH_DEV_USER " +
				"ou AUTH_KRB_KEYTAB e AUTH_KRB_SPN.")
		}
		log.Fatal("ERRO: AUTH_ENABLED=true exige AUTH_KRB_KEYTAB e AUTH_KRB_SPN " +
			"(ou AUTH_DEV_USER com APP_ENV=development).")
	}

	return &Config{
		Environment:     env,
		Port:            port,
		DBDriver:        dbDriver,
		DBDsn:           dbDsn,
		QueriesBasePath: queriesBasePath,
		ProductName:     productName,
		AuthEnabled:     authEnabled,
		AuthDevUser:     authDevUser,
		AuthKrbKeytab:   authKrbKeytab,
		AuthKrbSPN:      authKrbSPN,

		HtpasswdPath:         htpasswdPath,
		AdministratorsFile:   administratorsFile,
		AdministratorsSeed:   administratorsSeed,
		UserSettingsPath:     userSettingsPath,

		LogEnabled:             logEnabled,
		LogDir:                 logDir,
		LogFile:                logFile,
		LogRotation:            logRotation,
		LogMaxSizeBytes:        int64(logMaxSizeMB) * 1024 * 1024,
		LogMaxFiles:            logMaxFiles,
		LogToStdout:            logToStdout,
		LogRequestBodyMaxBytes: logBodyMax,
	}
}

func parseIntEnv(raw string, defaultVal int) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return defaultVal
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return defaultVal
	}
	return n
}

func parseCSVEnv(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func parseBoolEnv(raw string, defaultVal bool) bool {
	if raw == "" {
		return defaultVal
	}
	token := strings.ToLower(strings.TrimSpace(raw))
	switch token {
	case "true", "s", "1", "sim", "yes", "y":
		return true
	case "false", "n", "0", "nao", "não", "no":
		return false
	default:
		return defaultVal
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
