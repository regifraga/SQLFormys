package logging

import (
	"net/http"
	"strings"
	"time"
)

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	return s.ResponseWriter.Write(b)
}

// AccessMiddleware registra cada requisição (deve ficar dentro do middleware de auth).
func AccessMiddleware(l *Logger) func(http.Handler) http.Handler {
	if l == nil {
		return func(next http.Handler) http.Handler { return next }
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}

			start := time.Now()
			r, getUser := requestWithUserSlot(r)
			_ = wrapRequestBody(r, l.RequestBodyLimit())

			rec := &statusRecorder{ResponseWriter: w}
			next.ServeHTTP(rec, r)

			status := rec.status
			if status == 0 {
				status = http.StatusOK
			}

			user := strings.TrimSpace(getUser())
			if user == "" {
				user = "-"
			}

			body := capturedBody(r)
			values := formatHTTPValues(r, body)
			ts := start.Format("2006-01-02 15:04:05")
			l.LogAccess(ts, clientIP(r), user, r.Method, values, status, time.Since(start).Milliseconds())
		})
	}
}
