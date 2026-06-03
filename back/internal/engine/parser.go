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

	fieldNameRegex = regexp.MustCompile(`[@?#]+([A-Za-z0-9_.]+)`)
)

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

		typeUpper := strings.ToUpper(line)
		isSingle := strings.Contains(typeUpper, ":SINGLE(")
		isMulti := strings.Contains(typeUpper, ":MULTI(") || strings.Contains(typeUpper, ":MULTIPLE(")
		isExtended := isSingle || isMulti

		if isExtended {
			parts := splitMetadataLine(line, 7)
			if len(parts) < 6 {
				continue
			}
			fieldPart = parts[0]
			typePart = parts[1] // Keep casing for options like SINGLE(S=Simples) or MULTI(...)
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

// InjectValues takes the original SQL and user values, replaces the PROPERTIES block with SELECT injections (or SET statements for Postgres)
func InjectValues(sqlContent string, values map[string]interface{}, fields []domain.Field, driver string) string {
	// Process conditional comments: /*[VAR=VAL]*/content/*[/VAR]*/
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

		// Find the closing tag: /*[/VAR]*/
		closingTag := fmt.Sprintf("/*[/%s]*/", varName)
		closingIndex := strings.Index(sqlContent[fullEnd:], closingTag)
		if closingIndex == -1 {
			// If no closing tag is found, remove the opening tag to avoid infinite loop
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
			// Fallback to default value from fields metadata
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

	isPostgres := driver == "postgres" || driver == "pgx"

	if isPostgres {
		// In Postgres, session variables are set in a transaction before query execution,
		// so we do not inject any SQL statements in place of the properties block.
		return propertiesRegex.ReplaceAllString(sqlContent, "")
	}

	// Extract Properties block content to parse prefixes on the fly
	propMatch := propertiesRegex.FindStringSubmatch(sqlContent)
	if len(propMatch) == 0 {
		return sqlContent // No properties block found
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
		typeUpper := strings.ToUpper(line)
		if strings.Contains(typeUpper, ":SINGLE(") || strings.Contains(typeUpper, ":MULTI(") || strings.Contains(typeUpper, ":MULTIPLE(") {
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

	injectionBlock := strings.Join(injections, "\n")
	finalSQL := propertiesRegex.ReplaceAllString(sqlContent, injectionBlock)
	return finalSQL
}
