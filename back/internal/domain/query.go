package domain

import (
	"context"
)

// Query representa uma consulta salva vinculada a um projeto
type Query struct {
	ID        int    `json:"id"`
	ProjectID int    `json:"project_id"`
	Name      string `json:"name"`
	SQLSelect string `json:"sql_select"`
	SQLInsert string `json:"sql_insert"`
	Status    string `json:"status"`
}

// QueryRepository define as operações para persistir as queries configuradas
type QueryRepository interface {
	GetByID(ctx context.Context, id int) (*Query, error)
	ListByProjectID(ctx context.Context, projectID int) ([]*Query, error)
	Create(ctx context.Context, query *Query) error
}

// QueryService define as regras de negócio para gerenciar as consultas
type QueryService interface {
	ProcessInsert(ctx context.Context, queryID int, data map[string]interface{}) error
	ProcessUpdate(ctx context.Context, queryID int, data map[string]interface{}) error
}
