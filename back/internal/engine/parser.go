package engine

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"sqlformys/internal/domain"
	"sqlformys/internal/modulekind"
)

// SQLParser holds the parsed information of a module script
type SQLParser struct {
	ModuleKind  string
	OriginalSQL string
	Server      string
	Description string
	ExecuteMode string
	ResultType  string
	ConfirmType    string
	ConfirmMessage string
	Timeout     int
	CacheTTL    time.Duration // module-level --CACHE
	Fields      []domain.Field
	Lookups       map[string]string
	LookupCacheTTL map[string]time.Duration
	NamedQueries  map[string]string
	ModuleQueryRef      string // from --QUERY(Name)
	ResultTypeQueryRef  string // from --RESULT_TYPE=GRID QUERY(Name)
	Steps         []StepDefinition
	WizardEnabled   bool   // true only when --<WIZARD> ... --</WIZARD> is present
	WizardSummary        bool     // true when WIZARD block contains SUMMARY directive
	WizardSummaryLabel   string
	WizardSummaryFields  []string // empty = show all visible wizard fields
	WizardSummaryQuery   string   // SUMMARY QUERY(Name)
}

var (
	// SQL dialect regexes (default)
	serverRegex       = tagRegex("--", "SERVER")
	timeoutRegex      = tagRegex("--", "TIMEOUT")
	descriptionRegex  = tagRegex("--", "DESCRIPTION")
	executeModeRegex  = tagRegex("--", "EXECUTE_MODE")
	resultTypeRegex   = tagRegex("--", "RESULT_TYPE")
	propertiesRegex   = propertiesBlockRegex("--")
	lookupBlockRegex  = lookupBlockRegexFor("--")

	fieldNameRegex = regexp.MustCompile(`[@?#]+([A-Za-z0-9_.]+)`)

	declareStartRegex          = regexp.MustCompile(`(?i)\bDECLARE\b`)
	propertiesStartRegex       = regexp.MustCompile(`(?m)^\s*--\s*<PROPERTIES>`)
	declareContinuationRegex   = regexp.MustCompile(`(?i)^\s+@\w+`)
	declareVarNormalizeRegex   = regexp.MustCompile(`(?i)^IF\s*\(\s*@\w+[^)]*\)\s*SET\s+@\w+.*$`)
)

func tagRegex(prefix, name string) *regexp.Regexp {
	return regexp.MustCompile(`(?m)^` + regexp.QuoteMeta(prefix) + regexp.QuoteMeta(name) + `=(.*)$`)
}

var confirmTypes = map[string]struct{}{
	"CONFIRM": {},
	"WARNING": {},
	"DANGER":  {},
}

func confirmDirectiveLineRegex(prefix string) *regexp.Regexp {
	p := regexp.QuoteMeta(prefix)
	return regexp.MustCompile(`^\s*` + p + `CONFIRM(?:\s*=\s*(.*))?\s*$`)
}

// StripConfirmDirectives removes CONFIRM header lines from module content.
func StripConfirmDirectives(content, prefix string) string {
	re := confirmDirectiveLineRegex(prefix)
	var lines []string
	for _, line := range strings.Split(content, "\n") {
		if re.MatchString(line) {
			continue
		}
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n")
}

func parseConfirmDirective(content, prefix string) (confirmType, message string, ok bool) {
	re := confirmDirectiveLineRegex(prefix)
	var matches []string
	for _, line := range strings.Split(content, "\n") {
		if m := re.FindStringSubmatch(line); len(m) > 0 {
			matches = m
			break
		}
	}
	if len(matches) == 0 {
		return "", "", false
	}
	raw := ""
	if len(matches) > 1 {
		raw = strings.TrimSpace(matches[1])
	}
	if raw == "" || strings.EqualFold(raw, "CONFIRM") {
		return "CONFIRM", "", true
	}
	colon := strings.Index(raw, ":")
	var typePart, msgPart string
	if colon < 0 {
		typePart = raw
	} else {
		typePart = strings.TrimSpace(raw[:colon])
		msgPart = strings.TrimSpace(raw[colon+1:])
	}
	typeNorm := strings.ToUpper(strings.TrimSpace(typePart))
	if _, valid := confirmTypes[typeNorm]; !valid {
		return "", "", false
	}
	return typeNorm, msgPart, true
}

// ConfirmMetadata returns execute confirmation metadata when --CONFIRM is present.
func (p *SQLParser) ConfirmMetadata() *domain.ConfirmMetadata {
	if p.ConfirmType == "" {
		return nil
	}
	meta := &domain.ConfirmMetadata{Type: p.ConfirmType}
	if strings.TrimSpace(p.ConfirmMessage) != "" {
		meta.Message = p.ConfirmMessage
	}
	return meta
}

func propertiesBlockRegex(prefix string) *regexp.Regexp {
	p := regexp.QuoteMeta(prefix)
	return regexp.MustCompile(`(?si)` + p + `\s*<PROPERTIES>\s*\r?\n(.*?)\r?\n\s*` + p + `\s*</PROPERTIES>\s*`)
}

func lookupBlockRegexFor(prefix string) *regexp.Regexp {
	p := regexp.QuoteMeta(prefix)
	return regexp.MustCompile(`(?si)` + p + `\s*<LOOKUP\s+([A-Za-z][A-Za-z0-9_]*)(?:\s+(?:(?i)CACHE=)?(\d+[smh]))?\s*>\s*(.*?)\s*` + p + `\s*</LOOKUP>`)
}

type metadataDialect struct {
	kind              string
	linePrefix        string
	defaultResult     string
	allowServer       bool
	allowLookups      bool
	propertiesRegex   *regexp.Regexp
	lookupBlockRegex  *regexp.Regexp
	serverRegex       *regexp.Regexp
	timeoutRegex      *regexp.Regexp
	descriptionRegex  *regexp.Regexp
	executeModeRegex  *regexp.Regexp
	resultTypeRegex   *regexp.Regexp
	cacheRegex        *regexp.Regexp
}

func dialectForKind(kind string) metadataDialect {
	kind = modulekind.NormalizeKind(kind)
	if kind == "" {
		kind = modulekind.KindSQL
	}
	prefix := "--"
	defaultResult := "GRID"
	allowServer := true
	allowLookups := true
	if kind == modulekind.KindSH || kind == modulekind.KindPS1 {
		prefix = "#"
		defaultResult = "TEXT"
		allowServer = false
		allowLookups = false
	}
	return metadataDialect{
		kind:             kind,
		linePrefix:       prefix,
		defaultResult:    defaultResult,
		allowServer:      allowServer,
		allowLookups:     allowLookups,
		propertiesRegex:  propertiesBlockRegex(prefix),
		lookupBlockRegex: lookupBlockRegexFor(prefix),
		serverRegex:      tagRegex(prefix, "SERVER"),
		timeoutRegex:     tagRegex(prefix, "TIMEOUT"),
		descriptionRegex: tagRegex(prefix, "DESCRIPTION"),
		executeModeRegex: tagRegex(prefix, "EXECUTE_MODE"),
		resultTypeRegex:  tagRegex(prefix, "RESULT_TYPE"),
		cacheRegex:       tagRegex(prefix, "CACHE"),
	}
}

func isLineComment(line, prefix string) bool {
	line = strings.TrimSpace(line)
	return strings.HasPrefix(line, prefix)
}

func isChoiceFieldLine(line string) bool {
	typeUpper := strings.ToUpper(line)
	return strings.Contains(typeUpper, ":SINGLE(") ||
		strings.Contains(typeUpper, ":MULTI(") ||
		strings.Contains(typeUpper, ":MULTIPLE(") ||
		strings.Contains(typeUpper, ":LOOKUP(") ||
		strings.Contains(typeUpper, ":LOOKUP_MULTI(") ||
		strings.Contains(typeUpper, ":MULTILOOKUP(") ||
		strings.Contains(typeUpper, ":CONTEXT(")
}

// StripLookupBlocks removes --<LOOKUP ...> ... --</LOOKUP> sections so they are
// never executed as part of the main module query.
func StripLookupBlocks(sqlContent string) string {
	return lookupBlockRegex.ReplaceAllString(sqlContent, "")
}

func stripNamedQueriesForSQL(sqlContent string) string {
	return StripNamedQueryBlocks(sqlContent, "--")
}

// sqlServerDeclarePreambleEnd returns the byte offset within rest (starting at DECLARE) where
// the DECLARE preamble ends. It includes consecutive DECLARE lines, optional IF (@x) SET @x
// normalizers, and does not stop at SELECT/UPDATE inside IF/BEGIN blocks.
func sqlServerDeclarePreambleEnd(rest string) int {
	if strings.TrimSpace(rest) == "" {
		return 0
	}
	lines := strings.Split(rest, "\n")
	offset := 0
	i := 0

	for i < len(lines) {
		line := lines[i]
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			offset += len(line) + 1
			i++
			continue
		}
		if !declareStartRegex.MatchString(trimmed) {
			break
		}
		for {
			offset += len(lines[i]) + 1
			i++
			if i >= len(lines) {
				return offset
			}
			next := strings.TrimSpace(lines[i])
			if next == "" {
				break
			}
			if declareContinuationRegex.MatchString(lines[i]) {
				continue
			}
			if declareStartRegex.MatchString(next) {
				break
			}
			break
		}
	}

	for i < len(lines) {
		line := lines[i]
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			offset += len(line) + 1
			i++
			continue
		}
		if strings.HasPrefix(trimmed, "--") {
			offset += len(line) + 1
			i++
			continue
		}
		if declareVarNormalizeRegex.MatchString(trimmed) {
			offset += len(line) + 1
			i++
			continue
		}
		break
	}
	return offset
}

func declareBlockEndOffset(rest string) int {
	end := len(rest)
	if propLoc := propertiesStartRegex.FindStringIndex(rest); propLoc != nil && propLoc[0] > 0 {
		end = propLoc[0]
	}
	preambleEnd := sqlServerDeclarePreambleEnd(rest)
	if preambleEnd > 0 && preambleEnd < end {
		end = preambleEnd
	}
	return end
}

// extractSqlServerDeclareBlock returns the DECLARE section at the top of a script (before --<PROPERTIES>).
func extractSqlServerDeclareBlock(fileContent string) string {
	content := stripNamedQueriesForSQL(StripLookupBlocks(fileContent))
	loc := declareStartRegex.FindStringIndex(content)
	if loc == nil {
		return ""
	}
	rest := content[loc[0]:]
	end := declareBlockEndOffset(rest)
	block := strings.TrimSpace(rest[:end])
	if block == "" {
		return ""
	}
	return block
}

// stripSqlServerDeclareBlock removes the DECLARE preamble so it is not duplicated when
// the engine prepends extractSqlServerDeclareBlock separately (e.g. wizard residual SQL).
func stripSqlServerDeclareBlock(content string) string {
	content = stripNamedQueriesForSQL(StripLookupBlocks(content))
	loc := declareStartRegex.FindStringIndex(content)
	if loc == nil {
		return content
	}
	rest := content[loc[0]:]
	end := declareBlockEndOffset(rest)
	if end == 0 || end >= len(rest) {
		return content
	}
	blockEnd := loc[0] + end
	return strings.TrimSpace(content[:loc[0]] + content[blockEnd:])
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

var validResultTypes = map[string]string{
	"GRID":     "GRID",
	"TEXT":     "TEXT",
	"HTML":     "HTML",
	"MARKDOWN": "MARKDOWN",
	"MERMAID":  "MERMAID",
	"DOCUMENT": "DOCUMENT",
}

// NormalizeResultType maps the --RESULT_TYPE tag to a supported value (default GRID).
func NormalizeResultType(raw string) string {
	if raw == "" {
		return "GRID"
	}
	upper := strings.ToUpper(strings.TrimSpace(raw))
	if v, ok := validResultTypes[upper]; ok {
		return v
	}
	return "GRID"
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

// ParseMetadata reads SQL module content (backward compatible).
func ParseMetadata(sqlContent string) (*SQLParser, error) {
	return ParseMetadataForKind(sqlContent, modulekind.KindSQL)
}

// ParseMetadataForKind reads module content and extracts metadata for sql, sh, or ps1.
func ParseMetadataForKind(content, kind string) (*SQLParser, error) {
	d := dialectForKind(kind)
	parser := &SQLParser{
		ModuleKind:  d.kind,
		OriginalSQL: content,
		ResultType:  d.defaultResult,
		Fields:      make([]domain.Field, 0),
		Lookups:        make(map[string]string),
		LookupCacheTTL: make(map[string]time.Duration),
		NamedQueries:   make(map[string]string),
	}

	if cacheMatch := d.cacheRegex.FindStringSubmatch(content); len(cacheMatch) > 1 {
		ttl, err := ParseCacheArg(strings.TrimSpace(cacheMatch[1]))
		if err != nil {
			return nil, fmt.Errorf("CACHE: %w", err)
		}
		parser.CacheTTL = ttl
	}

	if d.allowLookups {
		for _, match := range d.lookupBlockRegex.FindAllStringSubmatch(content, -1) {
			if len(match) < 3 {
				continue
			}
			lookupName := strings.TrimSpace(match[1])
			parser.Lookups[lookupName] = strings.TrimSpace(match[3])
			if len(match) > 3 && strings.TrimSpace(match[2]) != "" {
				ttl, err := ParseCacheDuration(strings.TrimSpace(match[2]))
				if err != nil {
					return nil, fmt.Errorf("LOOKUP %s: %w", lookupName, err)
				}
				parser.LookupCacheTTL[lookupName] = ttl
			}
		}
	} else if len(d.lookupBlockRegex.FindAllStringSubmatch(content, -1)) > 0 {
		return nil, fmt.Errorf("blocos LOOKUP não são suportados em módulos %s", d.kind)
	}

	if d.allowServer {
		if serverMatch := d.serverRegex.FindStringSubmatch(content); len(serverMatch) > 1 {
			parser.Server = strings.TrimSpace(serverMatch[1])
		}
	}

	parser.Timeout = 60
	if timeoutMatch := d.timeoutRegex.FindStringSubmatch(content); len(timeoutMatch) > 1 {
		tVal := strings.TrimSpace(timeoutMatch[1])
		if val, err := strconv.Atoi(tVal); err == nil && val > 0 {
			parser.Timeout = val
		}
	}

	if descriptionMatch := d.descriptionRegex.FindStringSubmatch(content); len(descriptionMatch) > 1 {
		parser.Description = strings.TrimSpace(descriptionMatch[1])
	}

	if executeModeMatch := d.executeModeRegex.FindStringSubmatch(content); len(executeModeMatch) > 1 {
		parser.ExecuteMode = strings.TrimSpace(executeModeMatch[1])
	}

	if ct, msg, confirmOK := parseConfirmDirective(content, d.linePrefix); confirmOK {
		parser.ConfirmType = ct
		parser.ConfirmMessage = msg
	}

	if resultTypeMatch := d.resultTypeRegex.FindStringSubmatch(content); len(resultTypeMatch) > 1 {
		rtRaw, rtQuery := parseResultTypeAndQueryRef(resultTypeMatch[1])
		parser.ResultType = NormalizeResultType(rtRaw)
		parser.ResultTypeQueryRef = rtQuery
	}
	parser.ModuleQueryRef = parseModuleQueryDirective(content, d.linePrefix)
	if nq, nqErr := ParseNamedQueryBlocks(content, d.linePrefix); nqErr != nil {
		return nil, nqErr
	} else if len(nq) > 0 {
		parser.NamedQueries = nq
	}

	steps, err := parseStepBlocks(content, d, parser.ResultType)
	if err != nil {
		return nil, err
	}
	if len(steps) > 0 {
		parser.Steps = steps
		parser.WizardEnabled = hasWizardBlock(content, d.linePrefix)
		for _, st := range steps {
			parser.Fields = append(parser.Fields, st.Fields...)
			if len(st.NestedNamedQueries) > 0 {
				if parser.NamedQueries == nil {
					parser.NamedQueries = make(map[string]string)
				}
				if err := mergeStepNamedQueries(parser.NamedQueries, st.NestedNamedQueries, st.ID); err != nil {
					return nil, err
				}
			}
		}
		if parser.WizardEnabled {
			summaryOn, summaryLabel, summaryFields, summaryQuery, sumErr := parseWizardSummary(content, d.linePrefix)
			if sumErr != nil {
				return nil, sumErr
			}
			parser.WizardSummary = summaryOn
			parser.WizardSummaryLabel = summaryLabel
			parser.WizardSummaryFields = summaryFields
			parser.WizardSummaryQuery = summaryQuery
			if summaryOn && summaryQuery != "" {
				if _, ok := parser.NamedQuerySQL(summaryQuery); !ok {
					return nil, fmt.Errorf("SUMMARY referencia QUERY inexistente %q", summaryQuery)
				}
			}
			if summaryOn && len(summaryFields) > 0 {
				if err := validateWizardSummaryFields(summaryFields, parser.Fields); err != nil {
					return nil, err
				}
			}
		}
		return parser, nil
	}

	propMatch := d.propertiesRegex.FindStringSubmatch(content)
	if len(propMatch) == 0 {
		return parser, nil
	}

	propertiesBlock := propMatch[1]
	lines := strings.Split(propertiesBlock, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || !isLineComment(line, d.linePrefix) || !strings.Contains(line, "?") {
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
		if key, ok := ContextKeyFromFieldType(typePart); ok {
			field.ContextKey = key
			field.Hidden = true
		}
		if !d.allowLookups && fieldUsesLookup(typePart) {
			return nil, fmt.Errorf("tipo LOOKUP não suportado em módulos %s (campo %s)", d.kind, fieldName)
		}
		if err := ApplyLookupFieldMetadata(&field); err != nil {
			return nil, err
		}
		parser.Fields = append(parser.Fields, field)
	}

	return parser, nil
}

func fieldUsesLookup(typePart string) bool {
	upper := strings.ToUpper(typePart)
	return strings.Contains(upper, ":LOOKUP(") ||
		strings.Contains(upper, ":LOOKUP_MULTI(") ||
		strings.Contains(upper, ":MULTILOOKUP(")
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

var (
	isoDatePrefixRegex = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})`)
	compactDateRegex   = regexp.MustCompile(`^\d{8}$`)
)

// normalizeDateFieldValue converts HTML date input (YYYY-MM-DD) to YYYYMMDD when the
// field is DATE/DATETIME/TIMESTAMP with size 8, matching SQL Server style 112 usage in scripts.
func normalizeDateFieldValue(valStr string, field domain.Field) string {
	if valStr == "" {
		return valStr
	}
	typeUpper := strings.ToUpper(strings.TrimSpace(field.Type))
	if typeUpper != "DATE" && typeUpper != "DATETIME" && typeUpper != "TIMESTAMP" {
		return valStr
	}
	if compactDateRegex.MatchString(valStr) {
		return valStr
	}
	if field.Size != 0 && field.Size != 8 {
		return valStr
	}
	if parts := isoDatePrefixRegex.FindStringSubmatch(valStr); len(parts) == 4 {
		return parts[1] + parts[2] + parts[3]
	}
	return valStr
}

// InjectValues takes the original SQL and user values, replaces the PROPERTIES block with SELECT injections (or SET statements for Postgres)
func InjectValues(sqlContent string, values map[string]interface{}, fields []domain.Field, driver string) string {
	sqlContent = stripNamedQueriesForSQL(StripLookupBlocks(sqlContent))
	sqlContent = applyConditionalComments(sqlContent, values, fields)

	if isPostgresDriver(driver) {
		// In Postgres, session variables are set in a transaction before query execution,
		// so we do not inject any SQL statements in place of the properties block.
		return propertiesRegex.ReplaceAllString(sqlContent, "")
	}

	injectionBlock := buildInjectionBlock(sqlContent, values, fields, "")
	if injectionBlock == "" && propertiesRegex.FindStringSubmatch(sqlContent) == nil {
		return sqlContent
	}
	return propertiesRegex.ReplaceAllString(sqlContent, injectionBlock)
}

// InjectLookupValues prepares a named lookup query with the same form variables as the main module.
func InjectLookupValues(fileContent, lookupSQL, lookupField string, values map[string]interface{}, fields []domain.Field, driver string) string {
	lookupSQL = applyConditionalComments(lookupSQL, values, fields)
	if isPostgresDriver(driver) {
		return lookupSQL
	}

	stripped := StripLookupBlocks(fileContent)
	declareBlock := extractSqlServerDeclareBlock(fileContent)
	injections := buildInjectionBlock(stripped, values, fields, lookupField)

	var parts []string
	if declareBlock != "" {
		parts = append(parts, declareBlock)
	}
	if injections != "" {
		parts = append(parts, injections)
	}
	parts = append(parts, lookupSQL)
	return strings.Join(parts, "\n")
}

func buildInjectionBlock(sqlContent string, values map[string]interface{}, fields []domain.Field, skipField string) string {
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
		if skipField != "" && strings.EqualFold(field.Field, skipField) {
			continue
		}
		val, exists := values[field.Field]
		if !exists || val == nil {
			val = ""
		}

		valStr := fmt.Sprintf("%v", val)
		valStr = normalizeDateFieldValue(valStr, field)

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
