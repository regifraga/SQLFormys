package domain

import (
	"context"
)

// User representa a entidade Usuário
type User struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"-"` // A senha nunca deve ser serializada em JSON
}

// UserRepository define as operações de banco de dados para Usuário
type UserRepository interface {
	GetByID(ctx context.Context, id int) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	Create(ctx context.Context, user *User) error
}

// AuthService define as regras de negócio para Autenticação
type AuthService interface {
	Authenticate(ctx context.Context, email, password string) (string, error) // retorna token
	Register(ctx context.Context, user *User) error
}
