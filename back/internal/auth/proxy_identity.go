package auth

import (
	"encoding/base64"
	"net/http"
	"strings"
)

// IdentityFromProxyHeaders returns the user when the gateway (e.g. Nginx Basic Auth)
// forwarded credentials. Used when AUTH_ENABLED is false on the API.
func IdentityFromProxyHeaders(r *http.Request) (Identity, bool) {
	for _, key := range []string{"X-Remote-User", "X-Auth-User", "X-Forwarded-User"} {
		if u := strings.TrimSpace(r.Header.Get(key)); u != "" {
			return Identity{
				Username:    u,
				DisplayName: DisplayNameFromUsername(u),
			}, true
		}
	}

	authz := r.Header.Get("Authorization")
	if !strings.HasPrefix(authz, "Basic ") {
		return Identity{}, false
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(authz[6:]))
	if err != nil {
		return Identity{}, false
	}
	user, _, _ := strings.Cut(string(raw), ":")
	user = strings.TrimSpace(user)
	if user == "" {
		return Identity{}, false
	}
	return Identity{
		Username:    user,
		DisplayName: DisplayNameFromUsername(user),
	}, true
}
