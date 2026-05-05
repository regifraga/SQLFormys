package service

import (
	"context"
	"errors"
	"sqlformys/internal/domain"
)

type queryService struct {
	queryRepo domain.QueryRepository
}

// NewQueryService inicializa o serviço de queries
func NewQueryService(repo domain.QueryRepository) domain.QueryService {
	return &queryService{queryRepo: repo}
}

func (s *queryService) ProcessInsert(ctx context.Context, queryID int, data map[string]interface{}) error {
	// 1. Busca a Query cadastrada pelo ID
	// 2. Pega os dados validados e monta o SQL de INSERT usando parâmetros
	// 3. Executa contra o banco de dados de destino do projeto
	return errors.New("not implemented")
}

func (s *queryService) ProcessUpdate(ctx context.Context, queryID int, data map[string]interface{}) error {
	return errors.New("not implemented")
}
