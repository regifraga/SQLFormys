package logging

import (
	"fmt"
	"os"
	"strings"
	"sync"

	"sqlformys/internal/config"
)

var defaultLogger *Logger

// Logger escreve linhas em arquivo (com rotação) e opcionalmente no stdout.
type Logger struct {
	mu        sync.Mutex
	toStdout  bool
	file      *rotatingWriter
	bodyLimit int
}

// Init configura o logger global a partir da configuração da API.
func Init(cfg *config.Config) (*Logger, error) {
	if !cfg.LogEnabled {
		l := &Logger{toStdout: cfg.LogToStdout, bodyLimit: cfg.LogRequestBodyMaxBytes}
		setDefault(l)
		return l, nil
	}

	mode := RotationSize
	if strings.EqualFold(cfg.LogRotation, "daily") || strings.EqualFold(cfg.LogRotation, "date") {
		mode = RotationDaily
	}

	rw, err := newRotatingWriter(cfg.LogDir, cfg.LogFile, mode, cfg.LogMaxSizeBytes, cfg.LogMaxFiles)
	if err != nil {
		return nil, err
	}

	l := &Logger{
		toStdout:  cfg.LogToStdout,
		file:      rw,
		bodyLimit: cfg.LogRequestBodyMaxBytes,
	}
	setDefault(l)
	return l, nil
}

func setDefault(l *Logger) {
	defaultLogger = l
}

// Default retorna o logger global (pode ser nil antes de Init).
func Default() *Logger {
	return defaultLogger
}

func (l *Logger) Close() error {
	if l == nil || l.file == nil {
		return nil
	}
	return l.file.Close()
}

func (l *Logger) RequestBodyLimit() int {
	if l == nil {
		return 0
	}
	return l.bodyLimit
}

func (l *Logger) Write(p []byte) (int, error) {
	if l == nil {
		return os.Stdout.Write(p)
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	var firstErr error
	n := len(p)

	if l.file != nil {
		if _, err := l.file.Write(p); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if l.toStdout || l.file == nil {
		if _, err := os.Stdout.Write(p); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if firstErr != nil {
		return 0, firstErr
	}
	return n, nil
}

// Printf grava uma linha de log com timestamp.
func (l *Logger) Printf(format string, args ...any) {
	line := fmt.Sprintf(format, args...)
	l.LogLine(line)
}

// LogLine grava uma linha já formatada (com quebra de linha).
func (l *Logger) LogLine(line string) {
	if !strings.HasSuffix(line, "\n") {
		line += "\n"
	}
	_, _ = l.Write([]byte(line))
}

// LogAccess registra uma requisição HTTP atendida.
func (l *Logger) LogAccess(ts string, ip, user, method, httpValues string, status int, durationMs int64) {
	user = strings.TrimSpace(user)
	if user == "" {
		user = "-"
	}
	l.LogLine(fmt.Sprintf("%s | ip=%s | user=%s | %s | %s | status=%d | duration_ms=%d",
		ts, ip, user, method, httpValues, status, durationMs))
}
