package engine

import (
	"os"
	"path/filepath"
	"testing"

	"sqlformys/internal/domain"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWizard2RFNMetadata(t *testing.T) {
	root := filepath.Join("..", "..", "queries", "RFN-Tests", "Wizard-2.sql")
	b, err := os.ReadFile(root)
	if err != nil {
		t.Skip("Wizard-2.sql não disponível:", err)
	}
	p, err := ParseMetadata(string(b))
	require.NoError(t, err)
	require.True(t, p.WizardEnabled)
	sql, ok := p.NamedQuerySQL("PodeExecutar")
	require.True(t, ok, "PodeExecutar deve existir")
	assert.Contains(t, sql, "IC_EXECUTE")
	assert.NotContains(t, sql, "--SELECT", "QUERY pode manter linhas comentadas com --")
	var exitMsg *domain.UserMessage
	for i := range p.Messages {
		m := p.Messages[i]
		if m.When == "exit" && m.StepID == "ValidarLista" {
			exitMsg = &p.Messages[i]
			break
		}
	}
	require.NotNil(t, exitMsg)
	assert.Equal(t, "PodeExecutar", exitMsg.ValidateQueryName)
}