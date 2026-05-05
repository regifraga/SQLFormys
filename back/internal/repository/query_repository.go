package repository

import (
	"context"
	"errors"
	"sqlformys/internal/domain"
)

type queryRepository struct {
	// db *sql.DB
}

// NewQueryRepository cria uma nova instância de QueryRepository
func NewQueryRepository() domain.QueryRepository {
	return &queryRepository{}
}

func (r *queryRepository) GetByID(ctx context.Context, id int) (*domain.Query, error) {
	return nil, errors.New("not implemented")
}

func (r *queryRepository) ListByProjectID(ctx context.Context, projectID int) ([]*domain.Query, error) {
	return nil, errors.New("not implemented")
}

func (r *queryRepository) Create(ctx context.Context, query *domain.Query) error {
	return errors.New("not implemented")
}
