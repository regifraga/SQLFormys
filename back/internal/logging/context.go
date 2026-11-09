package logging

import (
	"context"
	"net/http"
)

type userHolderKey struct{}

// requestWithUserSlot associa um slot ao request para a auth preencher o usuário do access log.
func requestWithUserSlot(r *http.Request) (*http.Request, func() string) {
	holder := ""
	ctx := context.WithValue(r.Context(), userHolderKey{}, &holder)
	return r.WithContext(ctx), func() string { return holder }
}

// SetRequestUser registra o usuário autenticado para o access log (chamado pelo middleware de auth).
func SetRequestUser(r *http.Request, username string) {
	if p, ok := r.Context().Value(userHolderKey{}).(*string); ok && p != nil {
		*p = username
	}
}
