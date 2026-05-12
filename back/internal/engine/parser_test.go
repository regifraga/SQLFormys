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
		name     string
		values   map[string]interface{}
		contains []string
		excludes []string
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
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parser, _ := ParseMetadata(sqlBase)
			finalSQL := InjectValues(sqlBase, tt.values, parser.Fields)

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
