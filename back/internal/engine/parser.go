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
	Fields      []domain.Field
}

var (
	// Matches --SERVER=10.123.43.126
	serverRegex = regexp.MustCompile(`(?m)^--SERVER=(.*)$`)

	// Matches the properties block, including multiline content
	propertiesRegex = regexp.MustCompile(`(?si)--\s*<PROPERTIES>\s*\r?\n(.*?)\r?\n\s*--\s*</PROPERTIES>\s*`)

	fieldNameRegex = regexp.MustCompile(`[@?#]+([A-Za-z0-9_.]+)`)
)

func splitMetadataLine(line string) []string {
	parts := make([]string, 0, 5)
	remaining := line
	for i := 0; i < 4; i++ {
		idx := strings.Index(remaining, ":")
		if idx == -1 {
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

		parts := splitMetadataLine(line)
		if len(parts) < 5 {
			continue
		}

		fieldPart := parts[0]
		typePart := strings.TrimSpace(parts[1])
		sizePart := strings.TrimSpace(parts[2])
		operatorPart := strings.TrimSpace(parts[3])
		labelPart := strings.TrimSpace(parts[4])

		fieldNameMatch := fieldNameRegex.FindStringSubmatch(fieldPart)
		if len(fieldNameMatch) < 2 {
			continue
		}
		fieldName := fieldNameMatch[1]

		size, _ := strconv.Atoi(sizePart)

		field := domain.Field{
			Field:        fieldName,
			Type:         strings.ToUpper(typePart),
			Size:         size,
			Operator:     operatorPart,
			Label:        labelPart,
			Required:     strings.Contains(fieldPart, "#"),
			DefaultValue: "",
		}
		parser.Fields = append(parser.Fields, field)
	}

	return parser, nil
}

// InjectValues takes the original SQL and user values, replaces the PROPERTIES block with SELECT injections (or SET statements for Postgres)
func InjectValues(sqlContent string, values map[string]interface{}, fields []domain.Field, driver string) string {
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

		parts := splitMetadataLine(line)
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
		isNumeric := field.Type == "INT" || field.Type == "DECIMAL" || field.Type == "NUMERIC" || field.Type == "FLOAT"

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
