package engine

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func wizardFixture(withWizard string) string {
	return `--<STEP A>
--<PROPERTIES>
-- SELECT @?NM:VARCHAR:10:=:Nome
--</PROPERTIES>
--</STEP>
` + withWizard
}

func TestWizardUISyntaxVariants(t *testing.T) {
	cases := []struct {
		name    string
		wizard  string
		wantOn  bool
		wantHide bool
	}{
		{"opening", "--<WIZARD NO-STEPPER>\n-- STEP A: Etapa\n--</WIZARD>\n", true, true},
		{"inner", "--<WIZARD>\n-- NO-STEPPER\n-- STEP A: Etapa\n--</WIZARD>\n", true, true},
		{"missing_gt", "--<WIZARD NO-STEPPER\n-- STEP A: Etapa\n--</WIZARD>\n", true, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p, err := ParseMetadata(wizardFixture(tc.wizard))
			require.NoError(t, err)
			if tc.wantOn {
				require.True(t, p.HasWizard(), "HasWizard")
			} else {
				require.False(t, p.HasWizard(), "HasWizard")
			}
			require.Equal(t, tc.wantHide, p.WizardHideStepper, "hide")
		})
	}
}
