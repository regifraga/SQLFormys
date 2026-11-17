package engine

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWizard2PodeExecutarInjectEmptyNome(t *testing.T) {
	root := filepath.Join("..", "..", "queries", "RFN-Tests", "Wizard-2.sql")
	b, err := os.ReadFile(root)
	if err != nil {
		t.Skip("Wizard-2.sql não disponível:", err)
	}
	content := string(b)
	p, err := ParseMetadata(content)
	require.NoError(t, err)
	qsql, ok := p.NamedQuerySQL("PodeExecutar")
	require.True(t, ok)
	assert.Contains(t, qsql, "IC_EXECUTE")
	assert.NotContains(t, qsql, "--SELECT")
	out := InjectNamedQueryValues(content, qsql, "sql", map[string]interface{}{
		"NM_ARQUIVO": "",
		"IC_TAMANHO2": "S",
		"IC_TIPO":    "01",
	}, p.Fields, "sqlserver")
	assert.Contains(t, out, "NM_ARQUIVO")
	t.Log(out)
}