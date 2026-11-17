package engine

import (
	"os"
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
	assert.Nil(t, meta.Summary)
}

func TestParseWizardSummaryDirective(t *testing.T) {
	sql := `--<STEP A>
--<PROPERTIES>
-- SELECT @?NM:VARCHAR:10:=:Nome
--</PROPERTIES>
--</STEP>
--<WIZARD>
-- STEP A: Etapa A
-- SUMMARY: Confira os dados
--</WIZARD>
`
	parser, err := ParseMetadata(sql)
	require.NoError(t, err)
	assert.True(t, parser.WizardSummary)
	assert.Equal(t, "Confira os dados", parser.WizardSummaryLabel)
	meta := parser.WizardMetadata()
	require.NotNil(t, meta.Summary)
	assert.Equal(t, "Confira os dados", meta.Summary.Label)
	assert.Equal(t, "A", parser.LastStepID())
}

func TestParseWizardSummaryDefaultLabel(t *testing.T) {
	sql := `--<STEP A>
--<PROPERTIES>
-- SELECT @?NM:VARCHAR:10:=:Nome
--</PROPERTIES>
--</STEP>
--<WIZARD>
-- STEP A: Etapa A
-- SUMMARY
--</WIZARD>
`
	parser, err := ParseMetadata(sql)
	require.NoError(t, err)
	meta := parser.WizardMetadata()
	require.NotNil(t, meta.Summary)
	assert.Equal(t, "Resumo", meta.Summary.Label)
}

func TestParseWizardSummaryFieldSubset(t *testing.T) {
	sql := `--<STEP A>
--<PROPERTIES>
-- SELECT @?NM:VARCHAR:10:=:Nome
-- SELECT @?DT_INICIAL:DATE:8:=:Data Inicial
--</PROPERTIES>
--</STEP>
--<WIZARD>
-- STEP A: Etapa A
-- SUMMARY NM, DT_INICIAL
--</WIZARD>
`
	parser, err := ParseMetadata(sql)
	require.NoError(t, err)
	meta := parser.WizardMetadata()
	require.NotNil(t, meta.Summary)
	assert.Equal(t, []string{"NM", "DT_INICIAL"}, meta.Summary.FieldNames)
}

func TestParseWizardSummaryFieldSubsetWithLabel(t *testing.T) {
	sql := `--<STEP A>
--<PROPERTIES>
-- SELECT @?NM:VARCHAR:10:=:Nome
--</PROPERTIES>
--</STEP>
--<WIZARD>
-- STEP A: Etapa A
-- SUMMARY NM: Confira
--</WIZARD>
`
	parser, err := ParseMetadata(sql)
	require.NoError(t, err)
	meta := parser.WizardMetadata()
	require.NotNil(t, meta.Summary)
	assert.Equal(t, "Confira", meta.Summary.Label)
	assert.Equal(t, []string{"NM"}, meta.Summary.FieldNames)
}

func TestParseWizardSummaryUnknownField(t *testing.T) {
	sql := `--<STEP A>
--<PROPERTIES>
-- SELECT @?NM:VARCHAR:10:=:Nome
--</PROPERTIES>
--</STEP>
--<WIZARD>
-- STEP A: Etapa A
-- SUMMARY NM, INEXISTENTE
--</WIZARD>
`
	_, err := ParseMetadata(sql)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "inexistente")
}

func TestParseWizardDuplicateSummary(t *testing.T) {
	sql := `--<STEP A>
--<PROPERTIES>
-- SELECT @?NM:VARCHAR:10:=:Nome
--</PROPERTIES>
--</STEP>
--<WIZARD>
-- STEP A: Etapa A
-- SUMMARY
-- SUMMARY
--</WIZARD>
`
	_, err := ParseMetadata(sql)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "SUMMARY duplicada")
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
	final, err := InjectStepValues(sql, "S1", "sql", payload, parser.Fields, "GRID", "sqlserver", false, false)
	require.NoError(t, err)
	assert.Contains(t, final, "SELECT @NM_ARQUIVO='foo.sql'")
	assert.Contains(t, final, "SELECT @NM_ARQUIVO AS NM")
	assert.NotContains(t, final, "<STEP")
	assert.NotContains(t, final, "<WIZARD")
	assert.NotContains(t, final, "S2")
}

func TestParseStepBodyCommentedSQL(t *testing.T) {
	sql := `--<STEP IDLog>
--<PROPERTIES>
--SELECT @?#NR_SEQ_LOG:INT:10:=:ID do LOG
--</PROPERTIES>
--SELECT 		TOP 1 @MSG = DC_MENSAGEM
--FROM 			TABLE_X
--WHERE 			NR_SEQ_LOG = @NR_SEQ_LOG
--</STEP>
--<WIZARD>
-- STEP IDLog: ID do Log
--</WIZARD>
`
	parser, err := ParseMetadata(sql)
	require.NoError(t, err)
	require.Len(t, parser.Steps, 1)
	st := parser.Steps[0]
	assert.True(t, st.HasQuery)
	assert.Contains(t, st.Body, "@MSG = DC_MENSAGEM")
	assert.NotContains(t, st.Body, "--SELECT")
}

func TestInjectStepValuesCommentedStepBody(t *testing.T) {
	sql := `DECLARE @MSG VARCHAR(100) = '', @NR_SEQ_LOG BIGINT;

--<STEP IDLog>
--<PROPERTIES>
--SELECT @?#NR_SEQ_LOG:INT:10:=:ID do LOG
--</PROPERTIES>
--SELECT TOP 1 @MSG = 'teste'
--</STEP>
`
	parser, err := ParseMetadata(sql)
	require.NoError(t, err)
	final, err := InjectStepValues(sql, "IDLog", "sql", map[string]interface{}{"NR_SEQ_LOG": "99"}, parser.Fields, "GRID", "sqlserver", false, false)
	require.NoError(t, err)
	assert.Contains(t, final, "SELECT TOP 1 @MSG = 'teste'")
	assert.Contains(t, final, "SELECT @NR_SEQ_LOG=99")
	assert.Contains(t, final, "SELECT @MSG AS MSG")
}

func TestSqlServerDeclarePreambleEndRedeResidual(t *testing.T) {
	path := "../../queries/RFN-Tests/Rede - Reprocessar Retorno.sql"
	b, err := os.ReadFile(path)
	require.NoError(t, err)
	d := dialectForKind("sql")
	beforeStrip := residualSQLBeforeDeclareStrip(string(b), d)
	prepared := stripNamedQueriesForSQL(StripLookupBlocks(beforeStrip))
	loc := declareStartRegex.FindStringIndex(prepared)
	require.NotNil(t, loc)
	rest := prepared[loc[0]:]
	end := sqlServerDeclarePreambleEnd(rest)
	assert.True(t, strings.HasPrefix(strings.TrimLeft(rest[end:], "\r\n\t "), "IF EXISTS"), "end=%d suffix=%q", end, rest[end:min(len(rest), end+25)])
}

func TestRedeReprocessarRetornoFinalSQL(t *testing.T) {
	path := "../../queries/RFN-Tests/Rede - Reprocessar Retorno.sql"
	b, err := os.ReadFile(path)
	require.NoError(t, err)
	s := string(b)
	parser, err := ParseMetadata(s)
	require.NoError(t, err)
	final, err := InjectStepValues(s, "IDLog", "sql", map[string]interface{}{"NR_SEQ_LOG": "864612"}, parser.Fields, "GRID", "sqlserver", true, true)
	require.NoError(t, err)
	assert.NotContains(t, final, "\nLL;")
	assert.Contains(t, final, "IF EXISTS")
	assert.Contains(t, final, "ELSE")
	assert.NotContains(t, final, "--<STEP IDLog>")
}

func TestInjectStepValuesWizardFinalPreservesIfElse(t *testing.T) {
	sql := `DECLARE @NR_SEQ_LOG BIGINT = NULL;

--<STEP IDLog>
--<PROPERTIES>
-- SELECT @?#NR_SEQ_LOG:INT:10:=:ID
--</PROPERTIES>
--SELECT 1 AS step_only
--</STEP>
--<WIZARD>
-- STEP IDLog: Etapa
-- SUMMARY
--</WIZARD>

IF (@NR_SEQ_LOG = 0) SET @NR_SEQ_LOG = NULL;

IF EXISTS (SELECT TOP 1 1 FROM t WHERE id = @NR_SEQ_LOG)
BEGIN
	UPDATE t SET dh = GETDATE() WHERE id = @NR_SEQ_LOG
END
ELSE
BEGIN
	UPDATE t SET dh = DATEADD(day, -10, GETDATE()) WHERE id = @NR_SEQ_LOG
END
SELECT 2 AS final_row
`
	parser, err := ParseMetadata(sql)
	require.NoError(t, err)
	final, err := InjectStepValues(sql, "IDLog", "sql", map[string]interface{}{"NR_SEQ_LOG": "1"}, parser.Fields, "GRID", "sqlserver", true, true)
	require.NoError(t, err)
	assert.Contains(t, final, "IF EXISTS")
	assert.Contains(t, final, "ELSE")
	assert.NotRegexp(t, `(?s)END\s+ELSE.*UPDATE t SET dh = GETDATE\(\).*END\s+ELSE`, final)
	assert.Contains(t, final, "final_row")
	assert.NotContains(t, final, "step_only")
}

func TestInjectStepValuesWizardFinalUsesResidual(t *testing.T) {
	sql := `--<STEP IDLog>
--<PROPERTIES>
-- SELECT @?#NR_SEQ_LOG:INT:10:=:ID
--</PROPERTIES>
--SELECT 1 AS step_only
--</STEP>
--<WIZARD>
-- STEP IDLog: Etapa
-- SUMMARY
--</WIZARD>
UPDATE module_table SET x = 1
SELECT 2 AS final_row
`
	parser, err := ParseMetadata(sql)
	require.NoError(t, err)
	final, err := InjectStepValues(sql, "IDLog", "sql", map[string]interface{}{"NR_SEQ_LOG": "1"}, parser.Fields, "GRID", "sqlserver", true, true)
	require.NoError(t, err)
	assert.Contains(t, final, "UPDATE module_table")
	assert.Contains(t, final, "final_row")
	assert.NotContains(t, final, "step_only")
}

func TestInjectNamedQueryValuesDeclarePayloadVar(t *testing.T) {
	sql := `DECLARE @MSG VARCHAR(100) = '', @NR_SEQ_LOG BIGINT;

--<QUERY resumo>
SELECT @MSG AS MSG, @NR_SEQ_LOG AS NR_SEQ_LOG
--</QUERY>
`
	parser, err := ParseMetadata(sql)
	require.NoError(t, err)
	qsql, ok := parser.NamedQuerySQL("resumo")
	require.True(t, ok)
	out := InjectNamedQueryValues(sql, qsql, "sql", map[string]interface{}{
		"NR_SEQ_LOG": 864612,
		"MSG":        "mensagem do log",
	}, parser.Fields, "sqlserver")
	assert.Contains(t, out, "SELECT @MSG='mensagem do log'")
	assert.Contains(t, out, "SELECT @NR_SEQ_LOG=864612")
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
	final, err := InjectStepValues(sql, "Confirmacao", "sql", payload, parser.Fields, "GRID", "sqlserver", false, false)
	require.NoError(t, err)
	declareCount := strings.Count(strings.ToUpper(final), "DECLARE @NM_ARQUIVO")
	assert.Equal(t, 1, declareCount, "DECLARE must appear once: %s", final)
	assert.Contains(t, final, "SELECT @NM_ARQUIVO='test.sql'")
	assert.Contains(t, final, "@NM_ARQUIVO AS Nome")
}