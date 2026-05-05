package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	// Driver do SQL Server
	_ "github.com/microsoft/go-mssqldb"
)

// Connector gerencia a conexão com múltiplos tipos de banco de dados
type Connector struct {
	// Poderíamos manter um pool de conexões por projeto em memória ou reconectar sob demanda
}

// NewConnector inicializa um novo gerenciador de conexões
func NewConnector() *Connector {
	return &Connector{}
}

// Connect estabelece uma conexão baseada no driver e string de conexão (DSN)
func (c *Connector) Connect(ctx context.Context, driver string, dsn string) (*sql.DB, error) {
	// Valida os drivers suportados
	switch driver {
	case "postgres", "mysql", "sqlite3", "sqlserver":
		// OK
	default:
		return nil, errors.New("driver de banco de dados não suportado")
	}

	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, fmt.Errorf("erro ao abrir conexão: %w", err)
	}

	// Testa a conexão
	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("erro ao pingar o banco de dados: %w", err)
	}

	return db, nil
}
