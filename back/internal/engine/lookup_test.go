package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"sqlformys/internal/domain"
)

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
