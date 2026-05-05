package service

import (
	"context"
	"errors"
	"sqlformys/internal/domain"
)

type authService struct {
	userRepo domain.UserRepository
}

// NewAuthService inicializa o serviço de autenticação
func NewAuthService(repo domain.UserRepository) domain.AuthService {
	return &authService{userRepo: repo}
}

func (s *authService) Authenticate(ctx context.Context, email, password string) (string, error) {
	// 1. Busca usuário pelo email
	// 2. Compara hash da senha
	// 3. Gera e retorna JWT Token
	return "", errors.New("not implemented")
}

func (s *authService) Register(ctx context.Context, user *domain.User) error {
	// 1. Verifica se usuário já existe
	// 2. Hash da senha
	// 3. Persiste no banco de dados
	return errors.New("not implemented")
}
