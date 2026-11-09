package auth

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sqlformys/internal/config"
	"sqlformys/internal/logging"
)

func TestNewMiddleware_proxyUserRecordedInAccessLog(t *testing.T) {
	dir := t.TempDir()
	logPath := filepath.Join(dir, "access.log")

	cfg := &config.Config{
		LogEnabled:  true,
		LogDir:      dir,
		LogFile:     "access.log",
		LogRotation: "size",
		AuthEnabled: false,
	}
	logger, err := logging.Init(cfg)
	if err != nil {
		t.Fatalf("logging.Init: %v", err)
	}
	t.Cleanup(func() { _ = logger.Close() })

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := logging.AccessMiddleware(logger)(NewMiddleware(cfg, inner))

	req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
	req.Header.Set("X-Remote-User", "regivaldo")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	raw, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read log: %v", err)
	}
	line := string(raw)
	if !strings.Contains(line, "user=regivaldo") {
		t.Fatalf("expected user=regivaldo in log line, got: %q", line)
	}
}
