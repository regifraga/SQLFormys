package repository

import (
	"context"
	"database/sql"
	"errors"
)

// SchemaRepository define métodos para inspecionar os bancos de dados dos usuários
type SchemaRepository interface {
	ListTables(ctx context.Context, db *sql.DB) ([]string, error)
	GetTableStructure(ctx context.Context, db *sql.DB, tableName string) (interface{}, error)
}

type schemaRepository struct{}

// NewSchemaRepository cria um repositório para análise de schemas
func NewSchemaRepository() SchemaRepository {
	return &schemaRepository{}
}

func (r *schemaRepository) ListTables(ctx context.Context, db *sql.DB) ([]string, error) {
	// A implementação real dependerá do dialect (MySQL, Postgres, etc)
	// Será necessário construir uma abstração baseada no driver da conexão
	return nil, errors.New("not implemented")
}

func (r *schemaRepository) GetTableStructure(ctx context.Context, db *sql.DB, tableName string) (interface{}, error) {
	return nil, errors.New("not implemented")
}
