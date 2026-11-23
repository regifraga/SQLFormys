package engine

import "testing"

func TestParseWizardHideStepperNotSummaryLine(t *testing.T) {
	line := "SUMMARY QUERY(Lista) VALIDATE(PodeExecutar): Confira os dados para: {{ NM_ARQUIVO }}"
	if parseWizardHideStepper(line) {
		t.Fatalf("SUMMARY line must not match hide-stepper")
	}
	line2 := "MESSAGE ValidarLista EXIT VALIDATE(PodeExecutar) CONFIRM: texto"
	if parseWizardHideStepper(line2) {
		t.Fatalf("MESSAGE line must not match hide-stepper")
	}
}
