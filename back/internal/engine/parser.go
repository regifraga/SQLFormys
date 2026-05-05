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
	propertiesRegex = regexp.MustCompile(`(?s)--<PROPERTIES>\r?\n(.*?)\r?\n--</PROPERTIES>`)
	
	// Matches --SELECT @?#FIELD:TYPE:SIZE:OP:LABEL
	selectRegex = regexp.MustCompile(`--SELECT\s+@(\?)?(#)?([A-Za-z0-9_]+):([A-Za-z0-9_]+):(\d+):([^:]+):(.+)`)
)

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
		if line == "" || !strings.HasPrefix(line, "--SELECT") {
			continue
		}

		matches := selectRegex.FindStringSubmatch(line)
		if len(matches) == 8 {
			size, _ := strconv.Atoi(matches[5])

			field := domain.Field{
				Field:        matches[3],
				Type:         strings.ToUpper(matches[4]),
				Size:         size,
				Operator:     strings.TrimSpace(matches[6]),
				Label:        strings.TrimSpace(matches[7]),
				Required:     matches[2] == "#",
				DefaultValue: "",
			}
			parser.Fields = append(parser.Fields, field)
		}
	}

	return parser, nil
}

// InjectValues takes the original SQL and user values, replaces the PROPERTIES block with SELECT injections
func InjectValues(sqlContent string, values map[string]interface{}, fields []domain.Field) string {
	var injections []string
	
	for _, field := range fields {
		val, exists := values[field.Field]
		if !exists || val == nil {
			val = ""
		}

		valStr := fmt.Sprintf("%v", val)

		// Determine if value needs quotes based on Type
		isNumeric := field.Type == "INT" || field.Type == "DECIMAL" || field.Type == "NUMERIC" || field.Type == "FLOAT"
		
		if isNumeric {
			if valStr == "" {
				valStr = "NULL"
			}
			injections = append(injections, fmt.Sprintf("SELECT @%s=%s", field.Field, valStr))
		} else {
			if valStr == "" && !field.Required {
				// Avoid injecting empty strings into dates if they are not required, or let SQL handle it?
				// Using empty string is standard based on the docs: SELECT @NM_ARQUIVO=''
			}
			// Escape single quotes for SQL
			valStr = strings.ReplaceAll(valStr, "'", "''")
			injections = append(injections, fmt.Sprintf("SELECT @%s='%s'", field.Field, valStr))
		}
	}

	injectionBlock := strings.Join(injections, "\n")

	// Replace the entire properties block with the injection block
	finalSQL := propertiesRegex.ReplaceAllString(sqlContent, injectionBlock)

	return finalSQL
}
