package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseMetadata(t *testing.T) {
	tests := []struct {
		name        string
		sqlContent  string
		wantServer  string
		wantFields  int
		checkField  func(*testing.T, *SQLParser)
		expectError bool
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
