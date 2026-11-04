package engine

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"sqlformys/internal/domain"
)

// SQLParser holds the parsed information of a SQL script
type SQLParser struct {
	OriginalSQL string
	Server      string
	Description string
	ExecuteMode string
	Timeout     int
	Fields      []domain.Field
	Lookups     map[string]string
}

var (
	// Matches --SERVER=10.123.43.126
	serverRegex = regexp.MustCompile(`(?m)^--SERVER=(.*)$`)

	// Matches --TIMEOUT=10
	timeoutRegex = regexp.MustCompile(`(?m)^--TIMEOUT=(.*)$`)

	// Matches --DESCRIPTION=...
	descriptionRegex = regexp.MustCompile(`(?m)^--DESCRIPTION=(.*)$`)

	// Matches --EXECUTE_MODE=...
	executeModeRegex = regexp.MustCompile(`(?m)^--EXECUTE_MODE=(.*)$`)

	// Matches the properties block, including multiline content
	propertiesRegex = regexp.MustCompile(`(?si)--\s*<PROPERTIES>\s*\r?\n(.*?)\r?\n\s*--\s*</PROPERTIES>\s*`)

	// Matches named lookup queries: --<LOOKUP NomeDoLookUp> ... --</LOOKUP>
	lookupBlockRegex = regexp.MustCompile(`(?si)--\s*<LOOKUP\s+([A-Za-z][A-Za-z0-9_]*)\s*>\s*(.*?)\s*--\s*</LOOKUP>`)

	fieldNameRegex = regexp.MustCompile(`[@?#]+([A-Za-z0-9_.]+)`)
)

func isChoiceFieldLine(line string) bool {
	typeUpper := strings.ToUpper(line)
	return strings.Contains(typeUpper, ":SINGLE(") ||
		strings.Contains(typeUpper, ":MULTI(") ||
		strings.Contains(typeUpper, ":MULTIPLE(") ||
		strings.Contains(typeUpper, ":LOOKUP(") ||
		strings.Contains(typeUpper, ":LOOKUP_MULTI(") ||
		strings.Contains(typeUpper, ":MULTILOOKUP(")
}

// StripLookupBlocks removes --<LOOKUP ...> ... --</LOOKUP> sections so they are
// never executed as part of the main module query.
func StripLookupBlocks(sqlContent string) string {
	return lookupBlockRegex.ReplaceAllString(sqlContent, "")
}

// LookupSQL returns the inner SQL of a named lookup block (case-insensitive).
func (p *SQLParser) LookupSQL(name string) (string, bool) {
	if p == nil || p.Lookups == nil {
		return "", false
	}
	if sql, ok := p.Lookups[name]; ok {
		return sql, true
	}
	for key, sql := range p.Lookups {
		if strings.EqualFold(key, name) {
			return sql, true
		}
	}
	return "", false
}

func splitMetadataLine(line string, maxSplits int) []string {
	parts := make([]string, 0, maxSplits+1)
	remaining := line
	for i := 0; i < maxSplits; i++ {
		idx := strings.Index(remaining, ":")
		if idx == -1 {
			if i >= 4 {
				break
			}
			return nil
		}
		parts = append(parts, remaining[:idx])
		remaining = remaining[idx+1:]
	}
	parts = append(parts, remaining)
	return parts
}

// ParseMetadata reads the SQL content and extracts metadata
func ParseMetadata(sqlContent string) (*SQLParser, error) {
	parser := &SQLParser{
		OriginalSQL: sqlContent,
		Fields:      make([]domain.Field, 0),
		Lookups:     make(map[string]string),
	}

	for _, match := range lookupBlockRegex.FindAllStringSubmatch(sqlContent, -1) {
		if len(match) < 3 {
			continue
		}
		lookupName := strings.TrimSpace(match[1])
		parser.Lookups[lookupName] = strings.TrimSpace(match[2])
	}

	// Extract Server if present
	serverMatch := serverRegex.FindStringSubmatch(sqlContent)
	if len(serverMatch) > 1 {
		parser.Server = strings.TrimSpace(serverMatch[1])
	}

	// Extract Timeout if present, defaulting to 60
	parser.Timeout = 60
	timeoutMatch := timeoutRegex.FindStringSubmatch(sqlContent)
	if len(timeoutMatch) > 1 {
		tVal := strings.TrimSpace(timeoutMatch[1])
		if val, err := strconv.Atoi(tVal); err == nil && val > 0 {
			parser.Timeout = val
		}
	}

	// Extract Description if present
	descriptionMatch := descriptionRegex.FindStringSubmatch(sqlContent)
	if len(descriptionMatch) > 1 {
		parser.Description = strings.TrimSpace(descriptionMatch[1])
	}

	// Extract ExecuteMode if present
	executeModeMatch := executeModeRegex.FindStringSubmatch(sqlContent)
	if len(executeModeMatch) > 1 {
		parser.ExecuteMode = strings.TrimSpace(executeModeMatch[1])
	}

	// Extract Properties block
	propMatch := propertiesRegex.FindStringSubmatch(sqlContent)
	if len(propMatch) == 0 {
		return parser, nil // No properties block found
	}

	propertiesBlock := propMatch[1]

	// Parse fields
	lines := strings.Split(propertiesBlock, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "--") || !strings.Contains(line, "?") {
			continue
		}

		var fieldPart string
		var typePart string
		var sizePart string
		var operatorPart string
		var labelPart string
		var defaultValue string
		var information string
		var dbTypeVal string

		isExtended := isChoiceFieldLine(line)

		if isExtended {
			parts := splitMetadataLine(line, 7)
			if len(parts) < 6 {
				continue
			}
			fieldPart = parts[0]
			typePart = parts[1] // Keep casing for options like SINGLE(...) / MULTI(...) / LOOKUP(...)
			dbTypeVal = strings.ToUpper(strings.TrimSpace(parts[2]))
			sizePart = strings.TrimSpace(parts[3])
			operatorPart = strings.TrimSpace(parts[4])
			labelPart = strings.TrimSpace(parts[5])
			if len(parts) >= 7 {
				defaultValue = strings.TrimSpace(parts[6])
			}
			if len(parts) >= 8 {
				information = strings.TrimSpace(parts[7])
			}
		} else {
			parts := splitMetadataLine(line, 6)
			if len(parts) < 5 {
				continue
			}
			fieldPart = parts[0]
			typePart = strings.ToUpper(strings.TrimSpace(parts[1]))
			dbTypeVal = typePart
			sizePart = strings.TrimSpace(parts[2])
			operatorPart = strings.TrimSpace(parts[3])
			labelPart = strings.TrimSpace(parts[4])
			if len(parts) >= 6 {
				defaultValue = strings.TrimSpace(parts[5])
			}
			if len(parts) >= 7 {
				information = strings.TrimSpace(parts[6])
			}
		}

		fieldNameMatch := fieldNameRegex.FindStringSubmatch(fieldPart)
		if len(fieldNameMatch) < 2 {
			continue
		}
		fieldName := fieldNameMatch[1]

		size, _ := strconv.Atoi(sizePart)

		field := domain.Field{
			Field:        fieldName,
			Type:         typePart,
			Size:         size,
			Operator:     operatorPart,
			Label:        labelPart,
			Required:     strings.Contains(fieldPart, "#"),
			DefaultValue: defaultValue,
			Information:  information,
			DbType:       dbTypeVal,
		}
		parser.Fields = append(parser.Fields, field)
	}

	return parser, nil
}

func applyConditionalComments(sqlContent string, values map[string]interface{}, fields []domain.Field) string {
	startRegex := regexp.MustCompile(`/\*\[([A-Za-z0-9_.]+)=([^\]]+)\]\*/`)
	for {
		loc := startRegex.FindStringSubmatchIndex(sqlContent)
		if loc == nil {
			break
		}

		fullStart := loc[0]
		fullEnd := loc[1]
		varName := sqlContent[loc[2]:loc[3]]
		targetVal := sqlContent[loc[4]:loc[5]]

		closingTag := fmt.Sprintf("/*[/%s]*/", varName)
		closingIndex := strings.Index(sqlContent[fullEnd:], closingTag)
		if closingIndex == -1 {
			sqlContent = sqlContent[:fullStart] + sqlContent[fullEnd:]
			continue
		}

		actualClosingStart := fullEnd + closingIndex
		actualClosingEnd := actualClosingStart + len(closingTag)

		content := sqlContent[fullEnd:actualClosingStart]

		val, exists := values[varName]
		valStr := ""
		if exists && val != nil {
			valStr = fmt.Sprintf("%v", val)
		} else {
			for _, f := range fields {
				if f.Field == varName {
					valStr = f.DefaultValue
					break
				}
			}
		}

		replacement := ""
		if valStr == targetVal {
			replacement = content
		}

		sqlContent = sqlContent[:fullStart] + replacement + sqlContent[actualClosingEnd:]
	}
	return sqlContent
}

func isPostgresDriver(driver string) bool {
	return driver == "postgres" || driver == "pgx"
}

// InjectValues takes the original SQL and user values, replaces the PROPERTIES block with SELECT injections (or SET statements for Postgres)
func InjectValues(sqlContent string, values map[string]interface{}, fields []domain.Field, driver string) string {
	sqlContent = StripLookupBlocks(sqlContent)
	sqlContent = applyConditionalComments(sqlContent, values, fields)

	if isPostgresDriver(driver) {
		// In Postgres, session variables are set in a transaction before query execution,
		// so we do not inject any SQL statements in place of the properties block.
		return propertiesRegex.ReplaceAllString(sqlContent, "")
	}

	injectionBlock := buildInjectionBlock(sqlContent, values, fields)
	if injectionBlock == "" && propertiesRegex.FindStringSubmatch(sqlContent) == nil {
		return sqlContent
	}
	return propertiesRegex.ReplaceAllString(sqlContent, injectionBlock)
}

// InjectLookupValues prepares a named lookup query with the same form variables as the main module.
func InjectLookupValues(fileContent, lookupSQL string, values map[string]interface{}, fields []domain.Field, driver string) string {
	lookupSQL = applyConditionalComments(lookupSQL, values, fields)
	if isPostgresDriver(driver) {
		return lookupSQL
	}

	injections := buildInjectionBlock(StripLookupBlocks(fileContent), values, fields)
	if injections == "" {
		return lookupSQL
	}
	return injections + "\n" + lookupSQL
}

func buildInjectionBlock(sqlContent string, values map[string]interface{}, fields []domain.Field) string {
	propMatch := propertiesRegex.FindStringSubmatch(sqlContent)
	if len(propMatch) == 0 {
		return ""
	}

	propertiesBlock := propMatch[1]
	lines := strings.Split(propertiesBlock, "\n")

	// Map to keep track of the prefix for each field name
	fieldPrefixes := make(map[string]string)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "--") || !strings.Contains(line, "?") {
			continue
		}

		maxSplits := 6
		if isChoiceFieldLine(line) {
			maxSplits = 7
		}
		parts := splitMetadataLine(line, maxSplits)
		if len(parts) < 5 {
			continue
		}

		fieldPart := parts[0]

		fieldNameMatch := fieldNameRegex.FindStringSubmatch(fieldPart)
		if len(fieldNameMatch) < 2 {
			continue
		}
		fieldName := fieldNameMatch[1]

		// Extract prefix: everything before the first occurrence of '@', '?', or '#'
		symbolIdx := strings.IndexAny(fieldPart, "@?#")
		var rawPrefix string
		if symbolIdx != -1 {
			rawPrefix = fieldPart[:symbolIdx]
		} else {
			rawPrefix = fieldPart
		}

		cleanPrefix := strings.TrimPrefix(rawPrefix, "--")
		cleanPrefix = strings.TrimSpace(cleanPrefix)

		// Retain '@' if present before the field name
		fieldNameIdx := strings.Index(fieldPart, fieldName)
		if fieldNameIdx != -1 {
			beforeField := fieldPart[:fieldNameIdx]
			if strings.Contains(beforeField, "@") {
				if cleanPrefix != "" {
					cleanPrefix = cleanPrefix + " @"
				} else {
					cleanPrefix = "@"
				}
			}
		}

		fieldPrefixes[fieldName] = cleanPrefix
	}

	var injections []string

	for _, field := range fields {
		val, exists := values[field.Field]
		if !exists || val == nil {
			val = ""
		}

		valStr := fmt.Sprintf("%v", val)

		// Get the clean prefix for this field
		cleanPrefix, hasPrefix := fieldPrefixes[field.Field]
		if !hasPrefix {
			cleanPrefix = "SELECT @" // fallback
		}

		// Check if it's a query filter or variable assignment
		isVariableAssignment := strings.Contains(cleanPrefix, "@")

		// If it's a query filter and is optional and value is empty, skip it
		if !isVariableAssignment && !field.Required && valStr == "" {
			continue
		}

		// Format the value
		var valFormatted string
		isNumeric := field.Type == "INT" || field.Type == "DECIMAL" || field.Type == "NUMERIC" || field.Type == "FLOAT" ||
			field.DbType == "INT" || field.DbType == "DECIMAL" || field.DbType == "NUMERIC" || field.DbType == "FLOAT"

		if isNumeric {
			if valStr == "" {
				valFormatted = "NULL"
			} else {
				valFormatted = valStr
			}
		} else {
			escapedVal := strings.ReplaceAll(valStr, "'", "''")
			if strings.ToUpper(field.Operator) == "LIKE" {
				valFormatted = fmt.Sprintf("'%%%s%%'", escapedVal)
			} else {
				valFormatted = fmt.Sprintf("'%s'", escapedVal)
			}
		}

		// Construct injection line
		var prefixPart string
		if strings.HasSuffix(cleanPrefix, "@") {
			prefixPart = cleanPrefix
		} else if cleanPrefix != "" {
			prefixPart = cleanPrefix + " "
		}

		op := field.Operator
		if op == "" {
			op = "="
		}

		var lineInject string
		if isVariableAssignment {
			lineInject = fmt.Sprintf("%s%s%s%s", prefixPart, field.Field, op, valFormatted)
		} else {
			lineInject = fmt.Sprintf("%s%s %s %s", prefixPart, field.Field, op, valFormatted)
		}
		injections = append(injections, lineInject)
	}

	return strings.Join(injections, "\n")
}
