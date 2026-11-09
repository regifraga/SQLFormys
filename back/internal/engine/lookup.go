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
	lookupFieldTypeRegex = regexp.MustCompile(`(?i)^(?:LOOKUP_MULTI|MULTILOOKUP|LOOKUP)\(([^)]+)\)`)
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

// LookupNameFromFieldType extracts the lookup block name from LOOKUP(Name) / LOOKUP_MULTI(Name).
func LookupNameFromFieldType(fieldType string) string {
	match := lookupFieldTypeRegex.FindStringSubmatch(strings.TrimSpace(fieldType))
	if len(match) < 2 {
		return ""
	}
	return strings.TrimSpace(match[1])
}

func appendDependsOnUnique(dependsOn []string, fieldName string) []string {
	for _, existing := range dependsOn {
		if strings.EqualFold(existing, fieldName) {
			return dependsOn
		}
	}
	return append(dependsOn, fieldName)
}

func lookupOwnerField(lookupsByField map[string]string, lookupName string) string {
	for fieldName, name := range lookupsByField {
		if strings.EqualFold(name, lookupName) {
			return fieldName
		}
	}
	return ""
}

// ApplyLookupDependencies builds lookup metadata (with self-references removed) and
// sets Field.DependsOn on each LOOKUP / LOOKUP_MULTI form control.
func ApplyLookupDependencies(fields []domain.Field, lookups map[string]string) ([]domain.Field, map[string]domain.LookupMetadata) {
	metadata := make(map[string]domain.LookupMetadata, len(lookups))
	if len(lookups) == 0 {
		return fields, metadata
	}

	lookupsByField := make(map[string]string, len(fields))
	for _, field := range fields {
		if name := LookupNameFromFieldType(field.Type); name != "" {
			lookupsByField[field.Field] = name
		}
	}

	for lookupName, sql := range lookups {
		ownerField := lookupOwnerField(lookupsByField, lookupName)
		var dependsOn []string
		for _, ref := range LookupReferencedFields(sql) {
			formField, ok := findFormField(fields, ref)
			if !ok {
				continue
			}
			if ownerField != "" && strings.EqualFold(formField.Field, ownerField) {
				continue
			}
			dependsOn = appendDependsOnUnique(dependsOn, formField.Field)
		}
		metadata[lookupName] = domain.LookupMetadata{DependsOn: dependsOn}
	}

	enriched := make([]domain.Field, len(fields))
	copy(enriched, fields)
	for i := range enriched {
		lookupName := LookupNameFromFieldType(enriched[i].Type)
		if lookupName == "" {
			continue
		}
		if meta, ok := metadata[lookupName]; ok {
			enriched[i].DependsOn = append([]string(nil), meta.DependsOn...)
		}
	}

	return enriched, metadata
}

// BuildLookupsMetadata maps lookup names to form fields they reference.
func BuildLookupsMetadata(lookups map[string]string, fields []domain.Field) map[string]domain.LookupMetadata {
	_, metadata := ApplyLookupDependencies(fields, lookups)
	return metadata
}
