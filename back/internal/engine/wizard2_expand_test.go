package engine

import (
	"os"
	"path/filepath"
	"testing"
	"github.com/stretchr/testify/require"
)

func TestWizard2AfterExpandIncludes(t *testing.T) {
	base := filepath.Join("..", "..", "queries")
	path := filepath.Join("..", "..", "queries", "RFN-Tests", "Wizard-2.sql")
	b, err := os.ReadFile(path)
	require.NoError(t, err)
	expanded, err := ExpandIncludes(base, string(b), "sql")
	require.NoError(t, err)
	p, err := ParseMetadata(expanded)
	require.NoError(t, err)
	require.True(t, p.WizardSummary, "WizardSummary")
	require.Equal(t, "PodeExecutar", p.WizardSummaryValidateQuery)
	require.True(t, p.WizardHideStepper)
}
