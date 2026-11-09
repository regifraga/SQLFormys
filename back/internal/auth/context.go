package auth

import (
	"context"
	"strings"
)

type contextKey int

const identityKey contextKey = 1

// Identity represents the authenticated network user.
type Identity struct {
	Username    string
	DisplayName string
}

// WithIdentity stores identity on the request context.
func WithIdentity(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, identityKey, id)
}

// IdentityFromContext returns the identity if present.
func IdentityFromContext(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(identityKey).(Identity)
	return id, ok
}

// DisplayNameFromUsername derives a short name from DOMAIN\user or user@realm.
func DisplayNameFromUsername(username string) string {
	username = strings.TrimSpace(username)
	if username == "" {
		return ""
	}
	if i := strings.LastIndex(username, `\`); i >= 0 && i < len(username)-1 {
		return username[i+1:]
	}
	if i := strings.Index(username, "@"); i > 0 {
		return username[:i]
	}
	return username
}
