package engine

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"sqlformys/internal/modulekind"
)

func TestRunScript_TextStdout(t *testing.T) {
	dir := t.TempDir()
	script := filepath.Join(dir, "hello.sh")
	content := `#!/usr/bin/env bash
echo "hello world"
`
	if err := os.WriteFile(script, []byte(content), 0o755); err != nil {
		t.Fatal(err)
	}

	parser := &SQLParser{
		ModuleKind: modulekind.KindSH,
		ResultType: "TEXT",
		Timeout:    10,
	}
	result, err := RunScript(context.Background(), script, modulekind.KindSH, parser, map[string]interface{}{})
	assert.NoError(t, err)
	assert.Equal(t, "TEXT", result.ResultType)
	assert.Len(t, result.Rows, 1)
	assert.Contains(t, result.Rows[0]["stdout"], "hello world")
}

func TestGridFromScriptJSON(t *testing.T) {
	out := `[{"Id":1,"Name":"A"}]`
	qr, err := gridFromScriptJSON(out)
	assert.NoError(t, err)
	assert.Len(t, qr.Columns, 2)
	assert.Contains(t, qr.Columns, "Id")
	assert.Contains(t, qr.Columns, "Name")
	assert.Len(t, qr.Rows, 1)
}
