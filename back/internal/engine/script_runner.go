package engine

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"sqlformys/internal/domain"
	"sqlformys/internal/modulekind"
)

// RunScript executes a .sh or .ps1 module with form values passed as environment variables.
func RunScript(ctx context.Context, absPath, kind string, parser *SQLParser, payload map[string]interface{}) (domain.QueryResult, error) {
	if parser == nil {
		return domain.QueryResult{}, fmt.Errorf("parser inválido")
	}
	timeout := 60
	if parser.Timeout > 0 {
		timeout = parser.Timeout
	}
	runCtx, cancel := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancel()

	env := os.Environ()
	for _, field := range parser.Fields {
		val, exists := payload[field.Field]
		if !exists || val == nil {
			val = ""
		}
		env = append(env, fmt.Sprintf("%s=%s", field.Field, formatEnvValue(val)))
	}

	scriptPath, err := filepath.Abs(absPath)
	if err != nil {
		return domain.QueryResult{}, fmt.Errorf("caminho do script inválido: %w", err)
	}

	cmd, err := scriptCommand(runCtx, kind, scriptPath)
	if err != nil {
		return domain.QueryResult{}, err
	}
	cmd.Env = env
	cmd.Dir = filepath.Dir(scriptPath)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return domain.QueryResult{}, fmt.Errorf("falha ao executar script: %s", msg)
	}

	out := stdout.String()
	resultType := parser.ResultType
	if resultType == "" {
		resultType = "TEXT"
	}

	if strings.EqualFold(resultType, "GRID") {
		qr, err := gridFromScriptJSON(out)
		if err != nil {
			return domain.QueryResult{}, err
		}
		qr.ResultType = "GRID"
		return qr, nil
	}

	return domain.QueryResult{
		Columns:    []string{"stdout"},
		Rows:       []map[string]interface{}{{"stdout": out}},
		ResultType: resultType,
	}, nil
}

func formatEnvValue(val interface{}) string {
	switch v := val.(type) {
	case []interface{}:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			parts = append(parts, fmt.Sprintf("%v", item))
		}
		return strings.Join(parts, ",")
	case []string:
		return strings.Join(v, ",")
	default:
		return fmt.Sprintf("%v", val)
	}
}

func resolvePwshExecutable() (string, error) {
	if custom := strings.TrimSpace(os.Getenv("PWSH_PATH")); custom != "" {
		if st, err := os.Stat(custom); err == nil && !st.IsDir() {
			return custom, nil
		}
	}
	for _, name := range []string{"pwsh", "powershell"} {
		if path, err := exec.LookPath(name); err == nil {
			return path, nil
		}
	}
	for _, p := range []string{
		"/usr/local/bin/pwsh",
		"/usr/bin/pwsh",
		"/opt/microsoft/powershell/7/pwsh",
	} {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p, nil
		}
	}
	return "", fmt.Errorf("pwsh não encontrado no PATH (instale PowerShell ou defina PWSH_PATH; no Docker, reconstrua a imagem da API)")
}

func scriptCommand(ctx context.Context, kind, absPath string) (*exec.Cmd, error) {
	switch modulekind.NormalizeKind(kind) {
	case modulekind.KindSH:
		if bash, err := exec.LookPath("bash"); err == nil {
			return exec.CommandContext(ctx, bash, absPath), nil
		}
		if sh, err := exec.LookPath("sh"); err == nil {
			return exec.CommandContext(ctx, sh, absPath), nil
		}
		return nil, fmt.Errorf("bash/sh não encontrado no PATH")
	case modulekind.KindPS1:
		pwsh, err := resolvePwshExecutable()
		if err != nil {
			return nil, err
		}
		return exec.CommandContext(ctx, pwsh, "-NoProfile", "-NonInteractive", "-File", absPath), nil
	default:
		return nil, fmt.Errorf("tipo de script não suportado: %s", kind)
	}
}

func gridFromScriptJSON(stdout string) (domain.QueryResult, error) {
	trimmed := strings.TrimSpace(stdout)
	if trimmed == "" {
		return domain.QueryResult{Columns: []string{}, Rows: []map[string]interface{}{}}, nil
	}
	var rows []map[string]interface{}
	if err := json.Unmarshal([]byte(trimmed), &rows); err != nil {
		return domain.QueryResult{}, fmt.Errorf("RESULT_TYPE=GRID exige stdout JSON (array de objetos): %w", err)
	}
	if len(rows) == 0 {
		return domain.QueryResult{Columns: []string{}, Rows: rows}, nil
	}
	colSet := make(map[string]struct{})
	var columns []string
	for key := range rows[0] {
		colSet[key] = struct{}{}
		columns = append(columns, key)
	}
	for _, row := range rows[1:] {
		for key := range row {
			if _, ok := colSet[key]; !ok {
				colSet[key] = struct{}{}
				columns = append(columns, key)
			}
		}
	}
	return domain.QueryResult{Columns: columns, Rows: rows}, nil
}
