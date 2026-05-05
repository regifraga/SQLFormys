package handler

import (
	"fmt"
	"net/http"
)

type AuthHandler struct {
	// authService domain.AuthService
}

func NewAuthHandler() *AuthHandler {
	return &AuthHandler{}
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, "Endpoint de Login")
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, "Endpoint de Registro")
}
