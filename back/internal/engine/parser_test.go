package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseMetadata(t *testing.T) {
	sqlContent := `--SERVER=10.123.43.126
DECLARE @NM_ARQUIVO   			VARCHAR(100),
        @DT_INICIAL   			VARCHAR(8),
        @DT_FINAL     			VARCHAR(8),
        @CD_REMETENTE 			INT,
				@CD_GERACAO_ARQUIVO INT,
				@STRSQL						  VARCHAR(8000),
				@STRSQL_WHERE			  VARCHAR(400)

SELECT @CD_REMETENTE = 0,
       @NM_ARQUIVO   = '',
			 @STRSQL_WHERE = '',
			 @CD_GERACAO_ARQUIVO = 0

--<PROPERTIES>
--SELECT @?#DT_INICIAL:DATE:8:=:Data Inicial
--SELECT @?#DT_FINAL:DATE:8:=:Data Final
--SELECT @?NM_ARQUIVO:VARCHAR:100:=:Nome do Arquivo
--SELECT @?CD_REMETENTE:INT:8:=:Remetente
--SELECT @?CD_GERACAO_ARQUIVO:INT:10:=:CD_GERACAO_ARQUIVO (LOADEDFILE_ID)
--</PROPERTIES>

	SELECT @STRSQL = 'SELECT A.CD_LOTE'`

	parser, err := ParseMetadata(sqlContent)
	assert.NoError(t, err)
	assert.NotNil(t, parser)

	// Validate Server
	assert.Equal(t, "10.123.43.126", parser.Server)

	// Validate Fields
	assert.Len(t, parser.Fields, 5)

	// Field 1
	assert.Equal(t, "DT_INICIAL", parser.Fields[0].Field)
	assert.Equal(t, "DATE", parser.Fields[0].Type)
	assert.Equal(t, 8, parser.Fields[0].Size)
	assert.Equal(t, "=", parser.Fields[0].Operator)
	assert.Equal(t, "Data Inicial", parser.Fields[0].Label)
	assert.True(t, parser.Fields[0].Required)

	// Field 3
	assert.Equal(t, "NM_ARQUIVO", parser.Fields[2].Field)
	assert.False(t, parser.Fields[2].Required) // no #
}

func TestInjectValues(t *testing.T) {
	sqlContent := `--<PROPERTIES>
--SELECT @?#DT_INICIAL:DATE:8:=:Data Inicial
--SELECT @?CD_REMETENTE:INT:8:=:Remetente
--</PROPERTIES>
SELECT * FROM Table`

	parser, _ := ParseMetadata(sqlContent)

	values := map[string]interface{}{
		"DT_INICIAL":   "2026-04-01",
		"CD_REMETENTE": 144,
	}

	finalSQL := InjectValues(sqlContent, values, parser.Fields)

	assert.NotContains(t, finalSQL, "--<PROPERTIES>")
	assert.Contains(t, finalSQL, "SELECT @DT_INICIAL='2026-04-01'")
	assert.Contains(t, finalSQL, "SELECT @CD_REMETENTE=144")
	assert.Contains(t, finalSQL, "SELECT * FROM Table")
}
