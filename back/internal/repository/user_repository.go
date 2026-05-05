package repository

import (
	"context"
	"errors"
	"sqlformys/internal/domain"
)

type userRepository struct {
	// db *sql.DB // A conexão com o banco de dados principal do sistema (SQLite ou Postgres)
}

// NewUserRepository cria uma nova instância de UserRepository
func NewUserRepository() domain.UserRepository {
	return &userRepository{}
}

func (r *userRepository) GetByID(ctx context.Context, id int) (*domain.User, error) {
	// TODO: Implementar busca no DB
	return nil, errors.New("not implemented")
}

func (r *userRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	// TODO: Implementar busca no DB
	return nil, errors.New("not implemented")
}

func (r *userRepository) Create(ctx context.Context, user *domain.User) error {
	// TODO: Implementar inserção no DB
	return errors.New("not implemented")
}
