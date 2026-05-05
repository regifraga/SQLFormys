package service

import (
	"context"
	"errors"
)

// FormService define a lógica para gerar os formulários a partir dos schemas
type FormService interface {
	GenerateForm(ctx context.Context, projectID int, tableName string) (interface{}, error)
}

type formService struct {
	// Dependências como repositório do projeto e connector de banco de dados
}

// NewFormService inicializa o serviço de geração de formulários
func NewFormService() FormService {
	return &formService{}
}

func (s *formService) GenerateForm(ctx context.Context, projectID int, tableName string) (interface{}, error) {
	// 1. Busca credenciais do projeto
	// 2. Conecta no DB do cliente
	// 3. Lê o schema da tabela
	// 4. Mapeia os tipos de dados SQL para HTML/React
	// 5. Retorna o JSON descritivo do formulário
	return nil, errors.New("not implemented")
}
