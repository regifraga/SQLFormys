package auth

import (
	"net/http"
)

// IdentityFromRequest returns identity from context or proxy headers.
func IdentityFromRequest(r *http.Request) (Identity, bool) {
	if id, ok := IdentityFromContext(r.Context()); ok && id.Username != "" {
		return id, true
	}
	return IdentityFromProxyHeaders(r)
}
