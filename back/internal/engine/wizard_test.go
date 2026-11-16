package engine

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseWizardSteps(t *testing.T) {
	sql := `--DESCRIPTION=Fluxo guiado
--RESULT_TYPE=GRID

--<STEP ListarValores>
--<PROPERTIES>
-- SELECT @?NM_ARQUIVO:VARCHAR:100:=:File name
-- SELECT @?#IC_TAMANHO:CHAR:1:=:Show size column?:S:Include the size column
--</PROPERTIES>
SELECT 'lista' AS acao
--</STEP>

--<STEP Confirmacao>
--<PROPERTIES>
-- SELECT @?IC_CONFIRMA:CHAR:1:=:Confirma
--</PROPERTIES>--</STEP>

--<WIZARD>
-- STEP ListarValores: Lista de valores
-- STEP Confirmacao: Confirma dos dados
--</WIZARD>

DECLARE @x INT
`

	parser, err := ParseMetadata(sql)
	require.NoError(t, err)
	require.Len(t, parser.Steps, 2)
	assert.True(t, parser.WizardEnabled)
	assert.True(t, parser.HasWizard())
	assert.Equal(t, "ListarValores", parser.Steps[0].ID)
	assert.Equal(t, "Lista de valores", parser.Steps[0].Label)
	assert.True(t, parser.Steps[0].HasQuery)
	assert.Equal(t, "Confirmacao", parser.Steps[1].ID)
	assert.Equal(t, "Confirma dos dados", parser.Steps[1].Label)
	assert.False(t, parser.Steps[1].HasQuery)

	require.Len(t, parser.Fields, 3)
	assert.Equal(t, "ListarValores", parser.Fields[0].StepID)
	assert.Equal(t, "NM_ARQUIVO", parser.Fields[0].Field)
	assert.Equal(t, "Confirmacao", parser.Fields[2].StepID)

	meta := parser.WizardMetadata()
	require.NotNil(t, meta)
	assert.Len(t, meta.Steps, 2)
	assert.Equal(t, []string{"NM_ARQUIVO", "IC_TAMANHO"}, meta.Steps[0].FieldNames)
}

func TestParseStepsWithoutWizardBlockNotWizardMode(t *testing.T) {
	sql := `--<STEP A>
--<PROPERTIES>
-- SELECT @?NM:VARCHAR:10:=:Campo
--</PROPERTIES>
--</STEP>
--<PROPERTIES>
-- SELECT @?NM2:VARCHAR:10:=:Outro
--</PROPERTIES>
`
	parser, err := ParseMetadata(sql)
	require.NoError(t, err)
	require.Len(t, parser.Steps, 1)
	assert.False(t, parser.WizardEnabled)
	assert.False(t, parser.HasWizard())
	assert.Nil(t, parser.WizardMetadata())
}

func TestParseWizardDuplicateField(t *testing.T) {
	sql := `--<STEP A>
--<PROPERTIES>
-- SELECT @?NM:VARCHAR:10:=:A
--</PROPERTIES>
--</STEP>
--<STEP B>
--<PROPERTIES>
-- SELECT @?NM:VARCHAR:10:=:B
--</PROPERTIES>
--</STEP>
`
	_, err := ParseMetadata(sql)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "duplicado")
}

func TestInjectStepValues(t *testing.T) {
	sql := `--<STEP S1>
--<PROPERTIES>
-- SELECT @?NM_ARQUIVO:VARCHAR:100:=:File name
--</PROPERTIES>
SELECT @NM_ARQUIVO AS NM
--</STEP>
--<STEP S2>
--<PROPERTIES>
-- SELECT @?IC_CONFIRMA:CHAR:1:=:Confirma
--</PROPERTIES>
--</STEP>
`
	parser, err := ParseMetadata(sql)
	require.NoError(t, err)
	payload := map[string]interface{}{
		"NM_ARQUIVO":  "foo.sql",
		"IC_CONFIRMA": "S",
	}
	final, err := InjectStepValues(sql, "S1", "sql", payload, parser.Fields, "GRID", "sqlserver")
	require.NoError(t, err)
	assert.Contains(t, final, "SELECT @NM_ARQUIVO='foo.sql'")
	assert.Contains(t, final, "SELECT @NM_ARQUIVO AS NM")
	assert.NotContains(t, final, "<STEP")
	assert.NotContains(t, final, "<WIZARD")
	assert.NotContains(t, final, "S2")
}

func TestInjectStepValuesWizardLastStepDeclareNotDuplicated(t *testing.T) {
	sql := `--SERVER=localhost
--DESCRIPTION=Novo módulo SQL
--RESULT_TYPE=GRID
--TIMEOUT=60

DECLARE @NM_ARQUIVO		VARCHAR(100),
				@IC_TAMANHO2	CHAR(1),
        @IC_CONFIRMA	CHAR(1)

--<STEP ListarValores>
--<PROPERTIES>
-- SELECT @?#NM_ARQUIVO:VARCHAR:100:=:Nome do arquivo
--</PROPERTIES>
--</STEP>

--<STEP ValidarLista>
--<PROPERTIES>
-- SELECT @?#IC_TAMANHO2:CHAR:1:=:Show size column?:S:Incluir tamanho do arquivo
--</PROPERTIES>--</STEP>

--<STEP Confirmacao>
--<PROPERTIES>
-- SELECT @?IC_CONFIRMA:CHAR:1:=:Confirma
--</PROPERTIES>--</STEP>

--<WIZARD>
-- STEP ListarValores: Lista de valores
-- STEP ValidarLista: Validação
-- STEP Confirmacao: Confirma dos dados
--</WIZARD>

SELECT	@NM_ARQUIVO AS Nome,
				@IC_TAMANHO2 AS Tamanho,
        @IC_CONFIRMA AS Confirma
`
	parser, err := ParseMetadata(sql)
	require.NoError(t, err)
	payload := map[string]interface{}{
		"NM_ARQUIVO":  "test.sql",
		"IC_TAMANHO2": "S",
		"IC_CONFIRMA": "S",
	}
	final, err := InjectStepValues(sql, "Confirmacao", "sql", payload, parser.Fields, "GRID", "sqlserver")
	require.NoError(t, err)
	declareCount := strings.Count(strings.ToUpper(final), "DECLARE @NM_ARQUIVO")
	assert.Equal(t, 1, declareCount, "DECLARE must appear once: %s", final)
	assert.Contains(t, final, "SELECT @NM_ARQUIVO='test.sql'")
	assert.Contains(t, final, "@NM_ARQUIVO AS Nome")
}