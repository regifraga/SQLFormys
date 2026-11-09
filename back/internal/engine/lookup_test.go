package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"sqlformys/internal/domain"
)

func TestLookupReferencedFields(t *testing.T) {
	sql := `SELECT CdUsuario AS Code, NmUsuario AS Value
FROM COR_USUARIO
WHERE CdEmpresa = @CD_EMPRESA
/*[IC_ATIVO=S]*/AND IcAtivo = 'S'/*[/IC_ATIVO]*/
AND current_setting('vars.SG_UF', true) IS NOT NULL`

	fields := LookupReferencedFields(sql)
	assert.ElementsMatch(t, []string{"CD_EMPRESA", "IC_ATIVO", "SG_UF"}, fields)
}

func TestValidateLookupPrerequisites(t *testing.T) {
	fields := []domain.Field{
		{Field: "CD_EMPRESA", Label: "Empresa", Required: true},
		{Field: "CD_USUARIO", Label: "Usuário", Required: true},
	}
	lookupSQL := "SELECT CdUsuario AS Code FROM COR_USUARIO WHERE CdEmpresa = @CD_EMPRESA"

	err := ValidateLookupPrerequisites(lookupSQL, "CD_USUARIO", fields, map[string]interface{}{})
	var preErr *LookupPrerequisiteError
	assert.ErrorAs(t, err, &preErr)
	assert.Equal(t, []string{"Empresa"}, preErr.MissingLabels)

	err = ValidateLookupPrerequisites(lookupSQL, "CD_USUARIO", fields, map[string]interface{}{
		"CD_EMPRESA": 2,
	})
	assert.NoError(t, err)
}

func TestBuildLookupsMetadata(t *testing.T) {
	fields := []domain.Field{
		{Field: "CD_EMPRESA", Required: true},
		{Field: "CD_USUARIO", Required: true, Type: "LOOKUP(Usuarios)"},
	}
	lookups := map[string]string{
		"Usuarios": "SELECT CdUsuario AS Code FROM COR_USUARIO WHERE CdEmpresa = @CD_EMPRESA AND CdUsuario = @CD_USUARIO",
	}
	meta := BuildLookupsMetadata(lookups, fields)
	assert.Equal(t, []string{"CD_EMPRESA"}, meta["Usuarios"].DependsOn)
}

func TestApplyLookupDependenciesCascadeAndSelfReference(t *testing.T) {
	fields := []domain.Field{
		{Field: "IC_TIPO", Type: "LOOKUP(TipoArquivo)"},
		{Field: "IC_TIPO_CONSULTA", Type: "LOOKUP(TipoConsulta)"},
		{Field: "IC_DETALHE", Type: "LOOKUP(TipoDetalhe)"},
	}
	lookups := map[string]string{
		"TipoArquivo":  "SELECT Code, Value FROM T1",
		"TipoConsulta": "SELECT Code, Value FROM T2 WHERE Tipo = @IC_TIPO AND Consulta = @IC_TIPO_CONSULTA",
		"TipoDetalhe":  "SELECT Code, Value FROM T3 WHERE Consulta = @IC_TIPO_CONSULTA",
	}

	enriched, meta := ApplyLookupDependencies(fields, lookups)

	assert.Equal(t, []string(nil), meta["TipoArquivo"].DependsOn)
	assert.Equal(t, []string{"IC_TIPO"}, meta["TipoConsulta"].DependsOn)
	assert.Equal(t, []string{"IC_TIPO_CONSULTA"}, meta["TipoDetalhe"].DependsOn)

	assert.Empty(t, enriched[0].DependsOn)
	assert.Equal(t, []string{"IC_TIPO"}, enriched[1].DependsOn)
	assert.Equal(t, []string{"IC_TIPO_CONSULTA"}, enriched[2].DependsOn)
}

func TestLookupNameFromFieldType(t *testing.T) {
	assert.Equal(t, "TipoArquivo", LookupNameFromFieldType("LOOKUP(TipoArquivo)"))
	assert.Equal(t, "UFsAtendimento", LookupNameFromFieldType("LOOKUP_MULTI(UFsAtendimento)"))
	assert.Equal(t, "", LookupNameFromFieldType("VARCHAR"))
}

func TestMapLookupOptions(t *testing.T) {
	t.Run("Code and Value aliases", func(t *testing.T) {
		options := MapLookupOptions(domain.QueryResult{
			Columns: []string{"Code", "Value"},
			Rows: []map[string]interface{}{
				{"Code": 1, "Value": "Alice"},
				{"Code": 2, "Value": "Bob"},
			},
		})
		assert.Equal(t, []domain.LookupOption{
			{Code: 1, Value: "Alice"},
			{Code: 2, Value: "Bob"},
		}, options)
	})

	t.Run("case-insensitive aliases", func(t *testing.T) {
		options := MapLookupOptions(domain.QueryResult{
			Columns: []string{"CODE", "VALUE"},
			Rows: []map[string]interface{}{
				{"CODE": "SP", "VALUE": "São Paulo"},
			},
		})
		assert.Equal(t, []domain.LookupOption{
			{Code: "SP", Value: "São Paulo"},
		}, options)
	})

	t.Run("fallback to first two columns", func(t *testing.T) {
		options := MapLookupOptions(domain.QueryResult{
			Columns: []string{"CdUsuario", "NmUsuario"},
			Rows: []map[string]interface{}{
				{"CdUsuario": 10, "NmUsuario": "Regivaldo"},
			},
		})
		assert.Equal(t, []domain.LookupOption{
			{Code: 10, Value: "Regivaldo"},
		}, options)
	})

	t.Run("single column used as code and label", func(t *testing.T) {
		options := MapLookupOptions(domain.QueryResult{
			Columns: []string{"SgUF"},
			Rows: []map[string]interface{}{
				{"SgUF": "RJ"},
			},
		})
		assert.Equal(t, []domain.LookupOption{
			{Code: "RJ", Value: "RJ"},
		}, options)
	})
}
