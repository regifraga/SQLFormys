package engine

import (
	"fmt"
	"regexp"
	"strings"

	"sqlformys/internal/domain"
)

var (
	sqlServerVarRefRegex = regexp.MustCompile(`@([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)`)
	pgVarRefRegex        = regexp.MustCompile(`(?i)current_setting\s*\(\s*'vars\.([^']+)'`)
	conditionalVarRegex  = regexp.MustCompile(`/\*\[([A-Za-z0-9_.]+)=`)
)

// LookupPrerequisiteError is returned when required lookup dependencies are missing.
type LookupPrerequisiteError struct {
	MissingLabels []string
}

func (e *LookupPrerequisiteError) Error() string {
	return fmt.Sprintf("Preencha os campos obrigatórios antes de usar este lookup: %s", strings.Join(e.MissingLabels, ", "))
}

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

// LookupReferencedFields extracts form variable names referenced by a lookup SQL block.
func LookupReferencedFields(lookupSQL string) []string {
	seen := make(map[string]struct{})
	var fields []string

	add := func(name string) {
		name = strings.TrimSpace(name)
		if name == "" {
			return
		}
		key := strings.ToLower(name)
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		fields = append(fields, name)
	}

	for _, match := range sqlServerVarRefRegex.FindAllStringSubmatch(lookupSQL, -1) {
		if len(match) > 1 {
			add(match[1])
		}
	}
	for _, match := range pgVarRefRegex.FindAllStringSubmatch(lookupSQL, -1) {
		if len(match) > 1 {
			add(match[1])
		}
	}
	for _, match := range conditionalVarRegex.FindAllStringSubmatch(lookupSQL, -1) {
		if len(match) > 1 {
			add(match[1])
		}
	}

	return fields
}

func fieldValueFilled(field domain.Field, values map[string]interface{}) bool {
	val, exists := values[field.Field]
	if !exists || val == nil {
		for key, candidate := range values {
			if strings.EqualFold(key, field.Field) {
				val = candidate
				exists = true
				break
			}
		}
	}
	if !exists || val == nil {
		val = field.DefaultValue
	}
	return strings.TrimSpace(fmt.Sprintf("%v", val)) != ""
}

func findFormField(fields []domain.Field, name string) (domain.Field, bool) {
	for _, field := range fields {
		if strings.EqualFold(field.Field, name) {
			return field, true
		}
	}
	return domain.Field{}, false
}

// ValidateLookupPrerequisites ensures required fields referenced by the lookup SQL are filled.
func ValidateLookupPrerequisites(lookupSQL, lookupField string, fields []domain.Field, values map[string]interface{}) error {
	var missingLabels []string
	for _, ref := range LookupReferencedFields(lookupSQL) {
		if lookupField != "" && strings.EqualFold(ref, lookupField) {
			continue
		}
		field, ok := findFormField(fields, ref)
		if !ok || !field.Required {
			continue
		}
		if fieldValueFilled(field, values) {
			continue
		}
		label := field.Label
		if label == "" {
			label = field.Field
		}
		missingLabels = append(missingLabels, label)
	}

	if len(missingLabels) == 0 {
		return nil
	}
	return &LookupPrerequisiteError{MissingLabels: missingLabels}
}

// BuildLookupsMetadata maps lookup names to form fields they reference.
func BuildLookupsMetadata(lookups map[string]string, fields []domain.Field) map[string]domain.LookupMetadata {
	metadata := make(map[string]domain.LookupMetadata, len(lookups))
	if len(lookups) == 0 {
		return metadata
	}

	for name, sql := range lookups {
		var dependsOn []string
		for _, ref := range LookupReferencedFields(sql) {
			if _, ok := findFormField(fields, ref); ok {
				field, _ := findFormField(fields, ref)
				dependsOn = append(dependsOn, field.Field)
			}
		}
		metadata[name] = domain.LookupMetadata{DependsOn: dependsOn}
	}
	return metadata
}
