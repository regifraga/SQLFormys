package auth

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/jcmturner/goidentity/v6"
	"github.com/jcmturner/gokrb5/v8/keytab"
	"github.com/jcmturner/gokrb5/v8/service"
	"github.com/jcmturner/gokrb5/v8/spnego"
	"sqlformys/internal/config"
	"sqlformys/internal/logging"
)

// NewMiddleware applies optional network authentication on /api/* routes.
func NewMiddleware(cfg *config.Config, next http.Handler) http.Handler {
	if !cfg.AuthEnabled {
		return proxyIdentityForAccessLog(next)
	}

	protected := buildProtectedHandler(cfg, next)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions || !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		protected.ServeHTTP(w, r)
	})
}

// proxyIdentityForAccessLog não exige autenticação na API; apenas repassa o usuário
// do gateway (ex. Nginx Basic Auth via X-Remote-User) para o access log.
func proxyIdentityForAccessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if id, ok := IdentityFromProxyHeaders(r); ok {
			logging.SetRequestUser(r, id.Username)
		}
		next.ServeHTTP(w, r)
	})
}

func buildProtectedHandler(cfg *config.Config, next http.Handler) http.Handler {
	if cfg.AuthDevUser != "" && cfg.Environment == "development" {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := Identity{
				Username:    cfg.AuthDevUser,
				DisplayName: DisplayNameFromUsername(cfg.AuthDevUser),
			}
			logging.SetRequestUser(r, id.Username)
			next.ServeHTTP(w, r.WithContext(WithIdentity(r.Context(), id)))
		})
	}

	kt, err := keytab.Load(cfg.AuthKrbKeytab)
	if err != nil {
		log.Fatalf("Falha ao carregar keytab %s: %v", cfg.AuthKrbKeytab, err)
	}

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, ok := identityFromRequest(r)
		if !ok {
			writeAuthRequired(w)
			return
		}
		logging.SetRequestUser(r, id.Username)
		next.ServeHTTP(w, r.WithContext(WithIdentity(r.Context(), id)))
	})

	opts := []func(*service.Settings){}
	if cfg.AuthKrbSPN != "" {
		opts = append(opts, service.KeytabPrincipal(cfg.AuthKrbSPN))
	}
	return spnego.SPNEGOKRB5Authenticate(inner, kt, opts...)
}

func identityFromRequest(r *http.Request) (Identity, bool) {
	idc := goidentity.FromHTTPRequestContext(r)
	if idc == nil || !idc.Authenticated() {
		return Identity{}, false
	}
	user := idc.UserName()
	if user == "" {
		return Identity{}, false
	}
	if realm := idc.Domain(); realm != "" && !strings.Contains(user, `\`) && !strings.Contains(user, "@") {
		user = realm + `\` + user
	}
	return Identity{
		Username:    user,
		DisplayName: DisplayNameFromUsername(user),
	}, true
}

func writeAuthRequired(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("WWW-Authenticate", "Negotiate")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": "Autenticação de rede obrigatória",
	})
}
