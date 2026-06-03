package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"sqlformys/internal/domain"
)

func TestParseMetadata(t *testing.T) {
	tests := []struct {
		name            string
		sqlContent      string
		wantServer      string
		wantDescription string
		wantExecuteMode string
		wantTimeout     int
		wantFields      int
		checkField      func(*testing.T, *SQLParser)
		expectError     bool
	}{
		{
			name: "Full valid SQL with server and properties",
			sqlContent: "--SERVER=10.123.43.126\n" +
				"DECLARE @NM_ARQUIVO VARCHAR(100)\n" +
				"--<PROPERTIES>\n" +
				"--SELECT @?#DT_INICIAL:DATE:8:=:Data Inicial\n" +
				"--SELECT @?NM_ARQUIVO:VARCHAR:100:=:Nome do Arquivo\n" +
				"--</PROPERTIES>",
			wantServer: "10.123.43.126",
			wantFields: 2,
			checkField: func(t *testing.T, p *SQLParser) {
				assert.Equal(t, "DT_INICIAL", p.Fields[0].Field)
				assert.True(t, p.Fields[0].Required)
				assert.Equal(t, "NM_ARQUIVO", p.Fields[1].Field)
				assert.False(t, p.Fields[1].Required)
			},
		},
		{
			name: "Missing server but has properties",
			sqlContent: "--<PROPERTIES>\n" +
				"--SELECT @?CD_REMETENTE:INT:8:=:Remetente\n" +
				"--</PROPERTIES>",
			wantServer: "",
			wantFields: 1,
		},
		{
			name:       "No properties block",
			sqlContent: "SELECT * FROM Table",
			wantServer: "",
			wantFields: 0,
		},
		{
			name:       "Empty content",
			sqlContent: "",
			wantServer: "",
			wantFields: 0,
		},
		{
			name: "WHERE conditions and spaced properties tag",
			sqlContent: "--SERVER=10.123.43.126\n" +
				"-- <PROPERTIES> \n" +
				"--AND ?#A.CD_MARKETPLACE:INT:4:=:Cdigo do Marketplace\n" +
				"--AND ?A.CD_GESTOR_PARTICIPANTE:VARCHAR:20:LIKE:Cdigo do Cliente\n" +
				"--  </PROPERTIES>  ",
			wantServer: "10.123.43.126",
			wantFields: 2,
			checkField: func(t *testing.T, p *SQLParser) {
				assert.Equal(t, "A.CD_MARKETPLACE", p.Fields[0].Field)
				assert.Equal(t, "INT", p.Fields[0].Type)
				assert.Equal(t, 4, p.Fields[0].Size)
				assert.Equal(t, "=", p.Fields[0].Operator)
				assert.Equal(t, "Cdigo do Marketplace", p.Fields[0].Label)
				assert.True(t, p.Fields[0].Required)

				assert.Equal(t, "A.CD_GESTOR_PARTICIPANTE", p.Fields[1].Field)
				assert.Equal(t, "VARCHAR", p.Fields[1].Type)
				assert.Equal(t, 20, p.Fields[1].Size)
				assert.Equal(t, "LIKE", p.Fields[1].Operator)
				assert.Equal(t, "Cdigo do Cliente", p.Fields[1].Label)
				assert.False(t, p.Fields[1].Required)
			},
		},
		{
			name: "Spaced SELECT variables and spaced properties tag",
			sqlContent: "--SERVER=10.123.43.126\n" +
				"-- <PROPERTIES> \n" +
				"-- SELECT @?#CD_MARKETPLACE:INT:5:=:Codigo do Marketplace\n" +
				"-- SELECT @?QT_UNIDADES:INT:10:=:Quantidade de Unidades\n" +
				"-- </PROPERTIES> ",
			wantServer: "10.123.43.126",
			wantFields: 2,
			checkField: func(t *testing.T, p *SQLParser) {
				assert.Equal(t, "CD_MARKETPLACE", p.Fields[0].Field)
				assert.Equal(t, "INT", p.Fields[0].Type)
				assert.Equal(t, 5, p.Fields[0].Size)
				assert.Equal(t, "=", p.Fields[0].Operator)
				assert.Equal(t, "Codigo do Marketplace", p.Fields[0].Label)
				assert.True(t, p.Fields[0].Required)

				assert.Equal(t, "QT_UNIDADES", p.Fields[1].Field)
				assert.Equal(t, "INT", p.Fields[1].Type)
				assert.Equal(t, 10, p.Fields[1].Size)
				assert.Equal(t, "=", p.Fields[1].Operator)
				assert.Equal(t, "Quantidade de Unidades", p.Fields[1].Label)
				assert.False(t, p.Fields[1].Required)
			},
		},
		{
			name: "With description and execute mode metadata",
			sqlContent: "--SERVER=localhost\n" +
				"--DESCRIPTION=Mais um teste IDIOTA!\n" +
				"--EXECUTE_MODE=AUTO\n" +
				"--<PROPERTIES>\n" +
				"--SELECT @?#DT_INICIAL:DATE:8:=:Data Inicial\n" +
				"--</PROPERTIES>",
			wantServer:      "localhost",
			wantDescription: "Mais um teste IDIOTA!",
			wantExecuteMode: "AUTO",
			wantFields:      1,
		},
		{
			name: "With description, execute mode and timeout metadata",
			sqlContent: "--SERVER=localhost\n" +
				"--DESCRIPTION=Mais um teste IDIOTA!\n" +
				"--EXECUTE_MODE=AUTO\n" +
				"--TIMEOUT=10\n" +
				"--<PROPERTIES>\n" +
				"--SELECT @?#DT_INICIAL:DATE:8:=:Data Inicial\n" +
				"--</PROPERTIES>",
			wantServer:      "localhost",
			wantDescription: "Mais um teste IDIOTA!",
			wantExecuteMode: "AUTO",
			wantTimeout:     10,
			wantFields:      1,
		},
		{
			name: "With invalid timeout value (should default to 60)",
			sqlContent: "--SERVER=localhost\n" +
				"--TIMEOUT=abc\n" +
				"--<PROPERTIES>\n" +
				"--SELECT @?#DT_INICIAL:DATE:8:=:Data Inicial\n" +
				"--</PROPERTIES>",
			wantServer:      "localhost",
			wantTimeout:     60,
			wantFields:      1,
		},
		{
			name: "With default value (5th colon)",
			sqlContent: "--SERVER=localhost\n" +
				"--<PROPERTIES>\n" +
				"--SELECT @?IC_ATIVO:CHAR:1:=:Somente ativo?:N\n" +
				"--SELECT @?NM_ARQUIVO:VARCHAR:100:=:Nome do Arquivo\n" +
				"--</PROPERTIES>",
			wantServer:      "localhost",
			wantFields:      2,
			checkField: func(t *testing.T, p *SQLParser) {
				assert.Equal(t, "IC_ATIVO", p.Fields[0].Field)
				assert.Equal(t, "CHAR", p.Fields[0].Type)
				assert.Equal(t, 1, p.Fields[0].Size)
				assert.Equal(t, "=", p.Fields[0].Operator)
				assert.Equal(t, "Somente ativo?", p.Fields[0].Label)
				assert.False(t, p.Fields[0].Required)
				assert.Equal(t, "N", p.Fields[0].DefaultValue)

				assert.Equal(t, "NM_ARQUIVO", p.Fields[1].Field)
				assert.Equal(t, "", p.Fields[1].DefaultValue)
			},
		},
		{
			name: "With default value and information (6th colon)",
			sqlContent: "--SERVER=localhost\n" +
				"--<PROPERTIES>\n" +
				"--SELECT @?IC_ATIVO:CHAR:1:=:Somente ativo?:N:Informe se deseja ou não que bla bla bla!\n" +
				"--SELECT @?NM_ARQUIVO:VARCHAR:100:=:Nome do Arquivo\n" +
				"--</PROPERTIES>",
			wantServer:      "localhost",
			wantFields:      2,
			checkField: func(t *testing.T, p *SQLParser) {
				assert.Equal(t, "IC_ATIVO", p.Fields[0].Field)
				assert.Equal(t, "CHAR", p.Fields[0].Type)
				assert.Equal(t, 1, p.Fields[0].Size)
				assert.Equal(t, "=", p.Fields[0].Operator)
				assert.Equal(t, "Somente ativo?", p.Fields[0].Label)
				assert.False(t, p.Fields[0].Required)
				assert.Equal(t, "N", p.Fields[0].DefaultValue)
				assert.Equal(t, "Informe se deseja ou não que bla bla bla!", p.Fields[0].Information)

				assert.Equal(t, "NM_ARQUIVO", p.Fields[1].Field)
				assert.Equal(t, "", p.Fields[1].DefaultValue)
				assert.Equal(t, "", p.Fields[1].Information)
			},
		},
		{
			name: "With SINGLE field type",
			sqlContent: "--SERVER=localhost\n" +
				"--<PROPERTIES>\n" +
				"--SELECT @?#IC_TIPOS:SINGLE(S=Simples,V=Vários,A=Alguns,Nenhum):VARCHAR:10:=:Tipo:N:É apenas um exemplo\n" +
				"--</PROPERTIES>",
			wantServer:      "localhost",
			wantFields:      1,
			checkField: func(t *testing.T, p *SQLParser) {
				assert.Equal(t, "IC_TIPOS", p.Fields[0].Field)
				assert.Equal(t, "SINGLE(S=Simples,V=Vários,A=Alguns,Nenhum)", p.Fields[0].Type)
				assert.Equal(t, 10, p.Fields[0].Size)
				assert.Equal(t, "=", p.Fields[0].Operator)
				assert.Equal(t, "Tipo", p.Fields[0].Label)
				assert.True(t, p.Fields[0].Required)
				assert.Equal(t, "N", p.Fields[0].DefaultValue)
				assert.Equal(t, "É apenas um exemplo", p.Fields[0].Information)
			},
		},
		{
			name: "With MULTI field type",
			sqlContent: "--SERVER=localhost\n" +
				"--<PROPERTIES>\n" +
				"--SELECT @?#IC_VALORES:MULTI(S=Simples,V=Vários,A=Alguns,Nenhum):VARCHAR:40:=:Valores:S,A:Apenas mais um exemplo\n" +
				"--</PROPERTIES>",
			wantServer:      "localhost",
			wantFields:      1,
			checkField: func(t *testing.T, p *SQLParser) {
				assert.Equal(t, "IC_VALORES", p.Fields[0].Field)
				assert.Equal(t, "MULTI(S=Simples,V=Vários,A=Alguns,Nenhum)", p.Fields[0].Type)
				assert.Equal(t, 40, p.Fields[0].Size)
				assert.Equal(t, "=", p.Fields[0].Operator)
				assert.Equal(t, "Valores", p.Fields[0].Label)
				assert.True(t, p.Fields[0].Required)
				assert.Equal(t, "S,A", p.Fields[0].DefaultValue)
				assert.Equal(t, "Apenas mais um exemplo", p.Fields[0].Information)
			},
		},
		{
			name: "With MULTIPLE field type",
			sqlContent: "--SERVER=localhost\n" +
				"--<PROPERTIES>\n" +
				"--SELECT @?#IC_VALORES:MULTIPLE(S=Simples,V=Vários):VARCHAR:40:=:Valores:S,V:Apenas mais um exemplo\n" +
				"--</PROPERTIES>",
			wantServer:      "localhost",
			wantFields:      1,
			checkField: func(t *testing.T, p *SQLParser) {
				assert.Equal(t, "IC_VALORES", p.Fields[0].Field)
				assert.Equal(t, "MULTIPLE(S=Simples,V=Vários)", p.Fields[0].Type)
				assert.Equal(t, 40, p.Fields[0].Size)
				assert.Equal(t, "=", p.Fields[0].Operator)
				assert.Equal(t, "Valores", p.Fields[0].Label)
				assert.True(t, p.Fields[0].Required)
				assert.Equal(t, "S,V", p.Fields[0].DefaultValue)
				assert.Equal(t, "Apenas mais um exemplo", p.Fields[0].Information)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parser, err := ParseMetadata(tt.sqlContent)
			if tt.expectError {
				assert.Error(t, err)
				return
			}
			assert.NoError(t, err)
			assert.Equal(t, tt.wantServer, parser.Server)
			assert.Equal(t, tt.wantDescription, parser.Description)
			assert.Equal(t, tt.wantExecuteMode, parser.ExecuteMode)
			expectedTimeout := tt.wantTimeout
			if expectedTimeout == 0 {
				expectedTimeout = 60
			}
			assert.Equal(t, expectedTimeout, parser.Timeout)
			assert.Len(t, parser.Fields, tt.wantFields)
			if tt.checkField != nil {
				tt.checkField(t, parser)
			}
		})
	}
}

func TestInjectValues(t *testing.T) {
	sqlBase := "--SERVER=127.0.0.1\n--<PROPERTIES>\n" +
		"--SELECT @?#ID:INT:8:=:ID\n" +
		"--SELECT @?NAME:VARCHAR:50:=:Nome\n" +
		"--SELECT @?VAL:DECIMAL:10:=:Valor\n" +
		"--</PROPERTIES>\n" +
		"SELECT * FROM users"

	tests := []struct {
		name       string
		sqlContent string
		values     map[string]interface{}
		contains   []string
		excludes   []string
	}{
		{
			name: "Regular values with SQL escaping",
			values: map[string]interface{}{
				"ID":   123,
				"NAME": "O'Connor",
				"VAL":  45.67,
			},
			contains: []string{
				"SELECT @ID=123",
				"SELECT @NAME='O''Connor'",
				"SELECT @VAL=45.67",
			},
			excludes: []string{"--<PROPERTIES>", "--</PROPERTIES>"},
		},
		{
			name: "Missing optional values",
			values: map[string]interface{}{
				"ID": 1,
			},
			contains: []string{
				"SELECT @ID=1",
				"SELECT @NAME=''",
				"SELECT @VAL=NULL",
			},
		},
		{
			name: "Nil values for numeric fields",
			values: map[string]interface{}{
				"ID":  nil,
				"VAL": nil,
			},
			contains: []string{
				"SELECT @ID=NULL",
				"SELECT @VAL=NULL",
			},
		},
		{
			name: "WHERE clause filters (with optional empty value skipped)",
			sqlContent: "-- <PROPERTIES>\n" +
				"--AND ?#A.CD_MARKETPLACE:INT:4:=:Cdigo do Marketplace\n" +
				"--AND ?A.CD_GESTOR_PARTICIPANTE:VARCHAR:20:LIKE:Cdigo do Cliente\n" +
				"-- </PROPERTIES>\n" +
				"SELECT * FROM tbl",
			values: map[string]interface{}{
				"A.CD_MARKETPLACE":         4,
				"A.CD_GESTOR_PARTICIPANTE": "",
			},
			contains: []string{
				"AND A.CD_MARKETPLACE = 4",
			},
			excludes: []string{
				"A.CD_GESTOR_PARTICIPANTE",
				"-- <PROPERTIES>",
				"-- </PROPERTIES>",
			},
		},
		{
			name: "WHERE clause filters (with optional provided value)",
			sqlContent: "-- <PROPERTIES>\n" +
				"--AND ?#A.CD_MARKETPLACE:INT:4:=:Cdigo do Marketplace\n" +
				"--AND ?A.CD_GESTOR_PARTICIPANTE:VARCHAR:20:LIKE:Cdigo do Cliente\n" +
				"-- </PROPERTIES>\n" +
				"SELECT * FROM tbl",
			values: map[string]interface{}{
				"A.CD_MARKETPLACE":         4,
				"A.CD_GESTOR_PARTICIPANTE": "123",
			},
			contains: []string{
				"AND A.CD_MARKETPLACE = 4",
				"AND A.CD_GESTOR_PARTICIPANTE LIKE '%123%'",
			},
			excludes: []string{
				"-- <PROPERTIES>",
				"-- </PROPERTIES>",
			},
		},
		{
			name: "Spaced SELECT variables (with spaces between -- and SELECT)",
			sqlContent: "-- <PROPERTIES>\n" +
				"-- SELECT @?#CD_MARKETPLACE:INT:5:=:Codigo do Marketplace\n" +
				"-- SELECT @?QT_UNIDADES:INT:10:=:Quantidade de Unidades\n" +
				"-- </PROPERTIES>\n" +
				"SELECT * FROM tbl",
			values: map[string]interface{}{
				"CD_MARKETPLACE": 5,
				"QT_UNIDADES":    10,
			},
			contains: []string{
				"SELECT @CD_MARKETPLACE=5",
				"SELECT @QT_UNIDADES=10",
			},
			excludes: []string{
				"-- <PROPERTIES>",
				"-- </PROPERTIES>",
			},
		},
		{
			name: "SINGLE field type injection",
			sqlContent: "-- <PROPERTIES>\n" +
				"--SELECT @?#IC_TIPOS:SINGLE(S=Simples,V=Vários):VARCHAR:10:=:Tipo:N\n" +
				"-- </PROPERTIES>\n" +
				"SELECT * FROM tbl",
			values: map[string]interface{}{
				"IC_TIPOS": "S",
			},
			contains: []string{
				"SELECT @IC_TIPOS='S'",
			},
		},
		{
			name: "SINGLE field type numeric injection",
			sqlContent: "-- <PROPERTIES>\n" +
				"--SELECT @?#IC_TIPOS:SINGLE(1=Simples,2=Vários):INT:4:=:Tipo:1\n" +
				"-- </PROPERTIES>\n" +
				"SELECT * FROM tbl",
			values: map[string]interface{}{
				"IC_TIPOS": 2,
			},
			contains: []string{
				"SELECT @IC_TIPOS=2",
			},
		},
		{
			name: "MULTI field type injection",
			sqlContent: "-- <PROPERTIES>\n" +
				"--SELECT @?#IC_VALORES:MULTI(S=Simples,V=Vários):VARCHAR:40:=:Valores:S,V\n" +
				"-- </PROPERTIES>\n" +
				"SELECT * FROM tbl",
			values: map[string]interface{}{
				"IC_VALORES": "S,V",
			},
			contains: []string{
				"SELECT @IC_VALORES='S,V'",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sql := sqlBase
			if tt.sqlContent != "" {
				sql = tt.sqlContent
			}
			parser, _ := ParseMetadata(sql)
			finalSQL := InjectValues(sql, tt.values, parser.Fields, "sqlserver")

			for _, s := range tt.contains {
				assert.Contains(t, finalSQL, s)
			}
			for _, e := range tt.excludes {
				assert.NotContains(t, finalSQL, e)
			}
		})
	}
}

func TestInjectValuesPostgres(t *testing.T) {
	sqlBase := "--SERVER=127.0.0.1\n--<PROPERTIES>\n" +
		"--SELECT @?#ID:INT:8:=:ID\n" +
		"--SELECT @?NAME:VARCHAR:50:=:Nome\n" +
		"--SELECT @?VAL:DECIMAL:10:=:Valor\n" +
		"--</PROPERTIES>\n" +
		"SELECT * FROM users"

	tests := []struct {
		name     string
		values   map[string]interface{}
		contains []string
		excludes []string
	}{
		{
			name: "Postgres removes properties block",
			values: map[string]interface{}{
				"ID":   123,
				"NAME": "O'Connor",
				"VAL":  45.67,
			},
			contains: []string{"SELECT * FROM users"},
			excludes: []string{"--<PROPERTIES>", "--</PROPERTIES>", "@ID", "@NAME", "@VAL"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parser, _ := ParseMetadata(sqlBase)
			finalSQL := InjectValues(sqlBase, tt.values, parser.Fields, "postgres")

			for _, s := range tt.contains {
				assert.Contains(t, finalSQL, s)
			}
			for _, e := range tt.excludes {
				assert.NotContains(t, finalSQL, e)
			}
			assert.Contains(t, finalSQL, "SELECT * FROM users")
		})
	}
}

func TestParseRealFilesByNameSQL(t *testing.T) {
	content := `--SERVER=localhost

--<PROPERTIES>
-- SELECT @?NM_ARQUIVO:VARCHAR:100:=:Nome do Arquivo
-- SELECT @?#IC_ATIVO:CHAR:1:=:Somente ativo?:N:Informe se deseja ou não que bla bla bla!
-- SELECT @?IC_TIPO:SINGLE(S=Simples,V=Vários,A=Alguns,Nenhum):VARCHAR:10:=:Tipo::É apenas um exemplo tipo eu, ridículo
-- SELECT @?#IC_VALORES:MULTI(S=Simples,V=Vários,A=Alguns,Nenhum):VARCHAR:40:=:Valores:S,A:Apenas mais um exemplo
--</PROPERTIES>`

	parser, err := ParseMetadata(content)
	assert.NoError(t, err)
	assert.Equal(t, "localhost", parser.Server)
	assert.Len(t, parser.Fields, 4)

	// Test field 0
	assert.Equal(t, "NM_ARQUIVO", parser.Fields[0].Field)
	assert.Equal(t, "VARCHAR", parser.Fields[0].Type)
	assert.Equal(t, 100, parser.Fields[0].Size)
	assert.Equal(t, "=", parser.Fields[0].Operator)
	assert.Equal(t, "Nome do Arquivo", parser.Fields[0].Label)
	assert.False(t, parser.Fields[0].Required)
	assert.Equal(t, "", parser.Fields[0].DefaultValue)

	// Test field 1
	assert.Equal(t, "IC_ATIVO", parser.Fields[1].Field)
	assert.Equal(t, "CHAR", parser.Fields[1].Type)
	assert.Equal(t, 1, parser.Fields[1].Size)
	assert.Equal(t, "=", parser.Fields[1].Operator)
	assert.Equal(t, "Somente ativo?", parser.Fields[1].Label)
	assert.True(t, parser.Fields[1].Required)
	assert.Equal(t, "N", parser.Fields[1].DefaultValue)
	assert.Equal(t, "Informe se deseja ou não que bla bla bla!", parser.Fields[1].Information)

	// Test field 2
	assert.Equal(t, "IC_TIPO", parser.Fields[2].Field)
	assert.Equal(t, "SINGLE(S=Simples,V=Vários,A=Alguns,Nenhum)", parser.Fields[2].Type)
	assert.Equal(t, 10, parser.Fields[2].Size)
	assert.Equal(t, "=", parser.Fields[2].Operator)
	assert.Equal(t, "Tipo", parser.Fields[2].Label)
	assert.False(t, parser.Fields[2].Required)
	assert.Equal(t, "", parser.Fields[2].DefaultValue)
	assert.Equal(t, "É apenas um exemplo tipo eu, ridículo", parser.Fields[2].Information)

	// Test field 3
	assert.Equal(t, "IC_VALORES", parser.Fields[3].Field)
	assert.Equal(t, "MULTI(S=Simples,V=Vários,A=Alguns,Nenhum)", parser.Fields[3].Type)
	assert.Equal(t, 40, parser.Fields[3].Size)
	assert.Equal(t, "=", parser.Fields[3].Operator)
	assert.Equal(t, "Valores", parser.Fields[3].Label)
	assert.True(t, parser.Fields[3].Required)
	assert.Equal(t, "S,A", parser.Fields[3].DefaultValue)
	assert.Equal(t, "Apenas mais um exemplo", parser.Fields[3].Information)
}

func TestInjectValuesConditionalComments(t *testing.T) {
	sqlContent := `SELECT 
    CD_ARQUIVO as "Id", 
    NM_ARQUIVO as "Description", 
    /*[IC_TAMANHO=S]*/NR_TAMANHO_BYTES as "Size",/*[/IC_TAMANHO]*/
    DH_REGISTRO as "Date"
FROM dbo.COR_ARQUIVO`

	fields := []domain.Field{
		{
			Field:        "IC_TAMANHO",
			DefaultValue: "S",
		},
	}

	// Test 1: S value keeps the column
	resS := InjectValues(sqlContent, map[string]interface{}{"IC_TAMANHO": "S"}, fields, "postgres")
	assert.Contains(t, resS, `NR_TAMANHO_BYTES as "Size"`)

	// Test 2: N value removes the column
	resN := InjectValues(sqlContent, map[string]interface{}{"IC_TAMANHO": "N"}, fields, "postgres")
	assert.NotContains(t, resN, `NR_TAMANHO_BYTES as "Size"`)

	// Test 3: Nil/missing value falls back to default value "S"
	resDefault := InjectValues(sqlContent, map[string]interface{}{}, fields, "postgres")
	assert.Contains(t, resDefault, `NR_TAMANHO_BYTES as "Size"`)
}

