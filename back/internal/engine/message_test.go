package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseModuleMessageDirectives(t *testing.T) {
	sql := `--MESSAGE=WARNING: Olá {{NM}}
--MESSAGE=DANGER: Segundo aviso
SELECT 1
`
	msgs, err := parseModuleMessageDirectives(sql, "--")
	require.NoError(t, err)
	require.Len(t, msgs, 2)
	assert.Equal(t, "load", msgs[0].When)
	assert.Equal(t, "WARNING", msgs[0].Type)
	assert.Equal(t, "Olá {{NM}}", msgs[0].Message)
	assert.Equal(t, "DANGER", msgs[1].Type)
}

func TestParseWizardMessages(t *testing.T) {
	sql := `--<STEP A>
--<PROPERTIES>
-- SELECT @?NM:VARCHAR:10:=:Nome
--</PROPERTIES>
--</STEP>
--<WIZARD>
-- STEP A: Etapa
-- MESSAGE A ENTER WARNING: Ao entrar
-- MESSAGE A EXIT DANGER: Ao sair
-- MESSAGE FINISH CONFIRM: Ao executar
--</WIZARD>
`
	p, err := ParseMetadata(sql)
	require.NoError(t, err)
	require.Len(t, p.Messages, 3)
	assert.Equal(t, "enter", p.Messages[0].When)
	assert.Equal(t, "A", p.Messages[0].StepID)
	assert.Equal(t, "finish", p.Messages[2].When)
}

func TestParseWizardSummaryValidate(t *testing.T) {
	sql := `--<STEP A>
--<PROPERTIES>
-- SELECT @?NM:VARCHAR:10:=:Nome
--</PROPERTIES>
--</STEP>
--<QUERY Lista>
SELECT 1 AS x
--</QUERY>
--<QUERY PodeExecutar>
SELECT 'S' AS IC_EXECUTE
--</QUERY>
--<WIZARD>
-- STEP A: Etapa
-- SUMMARY QUERY(Lista) VALIDATE(PodeExecutar): Confira
--</WIZARD>
`
	p, err := ParseMetadata(sql)
	require.NoError(t, err)
	assert.Equal(t, "PodeExecutar", p.WizardSummaryValidateQuery)
	meta := p.WizardMetadata()
	require.NotNil(t, meta.Summary)
	assert.Equal(t, "PodeExecutar", meta.Summary.ValidateQueryName)
}