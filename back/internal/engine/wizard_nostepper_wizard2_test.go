package engine

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"github.com/stretchr/testify/require"
)

func TestWizard2NoStepperStillWizard(t *testing.T) {
	root := filepath.Join("..", "..", "queries", "RFN-Tests", "Wizard-2.sql")
	b, err := os.ReadFile(root)
	require.NoError(t, err)
	sql := strings.Replace(string(b), "--<WIZARD>", "--<WIZARD NO-STEPPER>", 1)
	p, err := ParseMetadata(sql)
	require.NoError(t, err)
	require.True(t, p.HasWizard(), "HasWizard")
	require.True(t, p.WizardHideStepper)
	meta := p.WizardMetadata()
	require.NotNil(t, meta)
	require.Len(t, meta.Steps, 3)
	require.True(t, meta.HideStepper)
}
