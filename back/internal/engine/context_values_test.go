package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"sqlformys/internal/domain"
)

func TestContextKeyFromFieldType(t *testing.T) {
	key, ok := ContextKeyFromFieldType("CONTEXT(USER_NAME)")
	assert.True(t, ok)
	assert.Equal(t, "USER_NAME", key)

	_, ok = ContextKeyFromFieldType("VARCHAR")
	assert.False(t, ok)
}

func TestParseMetadata_CONTEXTField(t *testing.T) {
	sqlContent := "--<PROPERTIES>\n" +
		"-- SELECT @?NM_USUARIO:CONTEXT(USER_NAME):VARCHAR:50:=:\n" +
		"--</PROPERTIES>"

	parser, err := ParseMetadata(sqlContent)
	assert.NoError(t, err)
	assert.Len(t, parser.Fields, 1)

	f := parser.Fields[0]
	assert.Equal(t, "NM_USUARIO", f.Field)
	assert.Equal(t, "CONTEXT(USER_NAME)", f.Type)
	assert.Equal(t, "USER_NAME", f.ContextKey)
	assert.True(t, f.Hidden)
	assert.Equal(t, "VARCHAR", f.DbType)
}

func TestApplyContextValues_USER_NAME(t *testing.T) {
	fields := []domain.Field{
		{Field: "NM_USUARIO", ContextKey: "USER_NAME", Hidden: true, Type: "CONTEXT(USER_NAME)", DbType: "VARCHAR"},
	}
	payload := map[string]interface{}{
		"NM_USUARIO": "forged-user",
		"DT_INICIAL": "2026-01-01",
	}

	ApplyContextValues(fields, payload, ContextSession{Username: `corp\jdoe`})
	assert.Equal(t, "corp\\jdoe", payload["NM_USUARIO"])
	assert.Equal(t, "2026-01-01", payload["DT_INICIAL"])
}

func TestApplyContextValues_USER_TYPE(t *testing.T) {
	fields := []domain.Field{
		{Field: "IC_TIPO_USUARIO", ContextKey: "USER_TYPE", Hidden: true, Type: "CONTEXT(USER_TYPE)", DbType: "VARCHAR"},
	}
	payload := map[string]interface{}{"IC_TIPO_USUARIO": "Administrator"}

	ApplyContextValues(fields, payload, ContextSession{Username: "jdoe", IsAdmin: false})
	assert.Equal(t, UserTypeStandard, payload["IC_TIPO_USUARIO"])

	payload["IC_TIPO_USUARIO"] = "Standard"
	ApplyContextValues(fields, payload, ContextSession{Username: "admin", IsAdmin: true})
	assert.Equal(t, UserTypeAdministrator, payload["IC_TIPO_USUARIO"])
}

func TestInjectValues_CONTEXTField(t *testing.T) {
	sqlContent := "DECLARE @NM_USUARIO VARCHAR(50)\n" +
		"--<PROPERTIES>\n" +
		"-- SELECT @?NM_USUARIO:CONTEXT(USER_NAME):VARCHAR:50:=:\n" +
		"--</PROPERTIES>\n" +
		"SELECT @NM_USUARIO AS login"

	parser, err := ParseMetadata(sqlContent)
	assert.NoError(t, err)

	payload := map[string]interface{}{"NM_USUARIO": "ignored"}
	ApplyContextValues(parser.Fields, payload, ContextSession{Username: "jdoe"})

	finalSQL := InjectValues(sqlContent, payload, parser.Fields, "sqlserver")
	assert.Contains(t, finalSQL, "SELECT @NM_USUARIO='jdoe'")
	assert.NotContains(t, finalSQL, "<PROPERTIES>")
}
