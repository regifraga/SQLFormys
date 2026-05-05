package domain

import (
	"context"
	"time"
)

// Project representa um projeto que contém conexões de banco de dados e queries
type Project struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UserID      int       `json:"user_id"`
}

// ProjectRepository define as operações de banco de dados para Projeto
type ProjectRepository interface {
	GetByID(ctx context.Context, id int) (*Project, error)
	ListByUserID(ctx context.Context, userID int) ([]*Project, error)
	Create(ctx context.Context, project *Project) error
	Update(ctx context.Context, project *Project) error
	Delete(ctx context.Context, id int) error
}

// ProjectService define as regras de negócio para Projetos
type ProjectService interface {
	CreateProject(ctx context.Context, project *Project) error
	GetProject(ctx context.Context, id int) (*Project, error)
	ListUserProjects(ctx context.Context, userID int) ([]*Project, error)
}
