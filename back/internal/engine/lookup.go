package engine

import (
	"strings"

	"sqlformys/internal/domain"
)

func lookupKeyEquals(name string, candidates ...string) bool {
	for _, candidate := range candidates {
		if strings.EqualFold(name, candidate) {
			return true
		}
	}
	return false
}

func findRowValue(row map[string]interface{}, columns []string, aliases ...string) (interface{}, bool) {
	for key, val := range row {
		if lookupKeyEquals(key, aliases...) {
			return val, true
		}
	}
	for _, col := range columns {
		if lookupKeyEquals(col, aliases...) {
			if val, ok := row[col]; ok {
				return val, true
			}
		}
	}
	return nil, false
}

// MapLookupOptions converts a query result into dropdown options.
// Preferred aliases are Code/Value (also Id/Label/Name). Otherwise the first
// two columns are used; a single column is used for both code and label.
func MapLookupOptions(result domain.QueryResult) []domain.LookupOption {
	options := make([]domain.LookupOption, 0, len(result.Rows))
	for _, row := range result.Rows {
		code, hasCode := findRowValue(row, result.Columns, "Code", "Id", "ID", "Cd")
		value, hasValue := findRowValue(row, result.Columns, "Value", "Label", "Name", "Text", "Description", "Descricao")

		if !hasCode && len(result.Columns) > 0 {
			if val, ok := row[result.Columns[0]]; ok {
				code = val
				hasCode = true
			}
		}
		if !hasValue && len(result.Columns) > 1 {
			if val, ok := row[result.Columns[1]]; ok {
				value = val
				hasValue = true
			}
		}
		if !hasValue && hasCode {
			value = code
		}
		if !hasCode {
			continue
		}

		options = append(options, domain.LookupOption{
			Code:  code,
			Value: value,
		})
	}
	return options
}
