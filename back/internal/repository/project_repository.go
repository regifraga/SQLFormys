package repository

import (
	"context"
	"errors"
	"sqlformys/internal/domain"
)

type projectRepository struct {
	// db *sql.DB
}

// NewProjectRepository cria uma nova instância de ProjectRepository
func NewProjectRepository() domain.ProjectRepository {
	return &projectRepository{}
}

func (r *projectRepository) GetByID(ctx context.Context, id int) (*domain.Project, error) {
	return nil, errors.New("not implemented")
}

func (r *projectRepository) ListByUserID(ctx context.Context, userID int) ([]*domain.Project, error) {
	return nil, errors.New("not implemented")
}

func (r *projectRepository) Create(ctx context.Context, project *domain.Project) error {
	return errors.New("not implemented")
}

func (r *projectRepository) Update(ctx context.Context, project *domain.Project) error {
	return errors.New("not implemented")
}

func (r *projectRepository) Delete(ctx context.Context, id int) error {
	return errors.New("not implemented")
}
