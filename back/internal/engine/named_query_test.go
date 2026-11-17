package engine

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseNamedQueryBlockWithCommentLines(t *testing.T) {
	sql := `--<QUERY Lista>
--SELECT @NM_ARQUIVO AS Nome,
--        @IC_TAMANHO2 AS Tamanho
--<QUERY>
`
	qs, err := ParseNamedQueryBlocks(sql, "--")
	require.NoError(t, err)
	require.Contains(t, qs, "Lista")
	assert.Contains(t, qs["Lista"], "SELECT @NM_ARQUIVO AS Nome")
	assert.NotContains(t, qs["Lista"], "--")
}

func TestParseNamedQueryBlockWithoutCommentLines(t *testing.T) {
	sql := `--<QUERY Lista>
SELECT @NM AS Nome
--</QUERY>
`
	qs, err := ParseNamedQueryBlocks(sql, "--")
	require.NoError(t, err)
	assert.Equal(t, "SELECT @NM AS Nome", qs["Lista"])
}

func TestExpandQueryReferenceInBody(t *testing.T) {
	sql := `--<QUERY Lista>
SELECT @NM AS Nome
--</QUERY>
QUERY(Lista)
`
	p, err := ParseMetadata(sql)
	require.NoError(t, err)
	out, err := ExpandQueryReferences("QUERY(Lista)", p, "--")
	require.NoError(t, err)
	assert.Equal(t, "SELECT @NM AS Nome", strings.TrimSpace(out))
}

func TestParseWizardSummaryNamedQuery(t *testing.T) {
	sql := `--<STEP A>
--<PROPERTIES>
-- SELECT @?NM:VARCHAR:10:=:Nome
--</PROPERTIES>
--</STEP>
--<QUERY Lista>
SELECT @NM AS Nome
--</QUERY>
--<WIZARD>
-- STEP A: Etapa A
-- SUMMARY QUERY(Lista): Confira os dados
--</WIZARD>
`
	parser, err := ParseMetadata(sql)
	require.NoError(t, err)
	assert.Equal(t, "Lista", parser.WizardSummaryQuery)
	meta := parser.WizardMetadata()
	require.NotNil(t, meta.Summary)
	assert.Equal(t, "Lista", meta.Summary.QueryName)
	assert.Equal(t, "Confira os dados", meta.Summary.Label)
}

func TestResultTypeWithNamedQueryRef(t *testing.T) {
	sql := `--RESULT_TYPE=GRID QUERY(Lista)
--<QUERY Lista>
SELECT 1 AS x
--</QUERY>
QUERY(Lista)
`
	p, err := ParseMetadata(sql)
	require.NoError(t, err)
	assert.Equal(t, "GRID", p.ResultType)
	assert.Equal(t, "Lista", p.ResultTypeQueryRef)
}

func TestInjectNamedQueryValuesWizardField(t *testing.T) {
	sql := `--SERVER=localhost

DECLARE @NM_ARQUIVO		VARCHAR(100) = '',
				@IC_TAMANHO2	CHAR(1) = '',
        @IC_TIPO			CHAR(2) = ''

--<QUERY Lista>
SELECT	CD_ARQUIVO as [Id],
				NM_ARQUIVO as [Description]
FROM		TESTE_ARQUIVO..COR_ARQUIVO
WHERE		NM_ARQUIVO LIKE '%' + @NM_ARQUIVO + '%'
--<QUERY>

--<STEP ListarValores>
--<PROPERTIES>
-- SELECT @?#NM_ARQUIVO:VARCHAR:100:=:Nome do arquivo
--</PROPERTIES>
--</STEP>
`
	parser, err := ParseMetadata(sql)
	require.NoError(t, err)
	qsql, ok := parser.NamedQuerySQL("Lista")
	require.True(t, ok)
	out := InjectNamedQueryValues(sql, qsql, "sql", map[string]interface{}{
		"NM_ARQUIVO":  "foo.sql",
		"IC_TAMANHO2": "S",
		"IC_TIPO":     "01",
	}, parser.Fields, "sqlserver")
	assert.Equal(t, 1, strings.Count(out, "FROM\t\tTESTE_ARQUIVO"), "QUERY Lista must run once after parameter injection")
	assert.Contains(t, out, "SELECT @NM_ARQUIVO='foo.sql'")
	assert.Contains(t, out, "foo.sql")
	assert.NotContains(t, out, "--SERVER")
}

func TestInjectStepValuesResolvesNamedQuery(t *testing.T) {
	sql := `--<STEP Last>
--<PROPERTIES>
-- SELECT @?NM:VARCHAR:10:=:Nome
--</PROPERTIES>
--</STEP>
--<QUERY Lista>
SELECT @NM AS Nome
--</QUERY>
QUERY(Lista)
`
	parser, err := ParseMetadata(sql)
	require.NoError(t, err)
	final, err := InjectStepValues(sql, "Last", "sql", map[string]interface{}{"NM": "x"}, parser.Fields, "GRID", "sqlserver", false, false)
	require.NoError(t, err)
	assert.Contains(t, final, "SELECT @NM AS Nome")
	assert.NotContains(t, final, "QUERY(Lista)")
}