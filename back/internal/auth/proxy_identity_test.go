package auth

import (
	"encoding/base64"
	"net/http"
	"testing"
)

func TestIdentityFromProxyHeaders_XRemoteUser(t *testing.T) {
	r, _ := http.NewRequest(http.MethodGet, "/api/auth/me", nil)
	r.Header.Set("X-Remote-User", "meu.usuario")
	id, ok := IdentityFromProxyHeaders(r)
	if !ok || id.Username != "meu.usuario" || id.DisplayName != "meu.usuario" {
		t.Fatalf("got ok=%v id=%+v", ok, id)
	}
}

func TestIdentityFromProxyHeaders_Basic(t *testing.T) {
	r, _ := http.NewRequest(http.MethodGet, "/api/auth/me", nil)
	raw := base64.StdEncoding.EncodeToString([]byte("alice:secret"))
	r.Header.Set("Authorization", "Basic "+raw)
	id, ok := IdentityFromProxyHeaders(r)
	if !ok || id.Username != "alice" {
		t.Fatalf("got ok=%v id=%+v", ok, id)
	}
}
