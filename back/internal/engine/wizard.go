package engine

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"sqlformys/internal/domain"
)

// StepDefinition holds parsed content for one wizard step.
type StepDefinition struct {
	ID              string
	Label           string
	Fields          []domain.Field
	Body            string
	PropertiesBlock string
	ResultType      string
	HasQuery        bool
}

func stepBlockRegexFor(prefix string) *regexp.Regexp {
	p := regexp.QuoteMeta(prefix)
	return regexp.MustCompile(`(?si)` + p + `\s*<STEP\s+([A-Za-z][A-Za-z0-9_]*)\s*>\s*(.*?)\s*` + p + `\s*</STEP>`)
}

func wizardBlockRegexFor(prefix string) *regexp.Regexp {
	p := regexp.QuoteMeta(prefix)
	return regexp.MustCompile(`(?si)` + p + `\s*<WIZARD>\s*\r?\n(.*?)\r?\n\s*` + p + `\s*</WIZARD>`)
}

var wizardStepLineRegex = regexp.MustCompile(`(?i)^STEP\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.+)$`)

func hasWizardBlock(content, linePrefix string) bool {
	return wizardBlockRegexFor(linePrefix).FindStringIndex(content) != nil
}

func parseWizardLabels(content, linePrefix string) map[string]string {
	re := wizardBlockRegexFor(linePrefix)
	match := re.FindStringSubmatch(content)
	if len(match) < 2 {
		return nil
	}
	labels := make(map[string]string)
	for _, line := range strings.Split(match[1], "\n") {
		line = strings.TrimSpace(line)
		if !isLineComment(line, linePrefix) {
			continue
		}
		trimmed := strings.TrimSpace(strings.TrimPrefix(line, linePrefix))
		sub := wizardStepLineRegex.FindStringSubmatch(trimmed)
		if len(sub) < 3 {
			continue
		}
		labels[sub[1]] = strings.TrimSpace(sub[2])
	}
	return labels
}

func parseFieldsFromPropertiesBlock(propertiesBlock string, d metadataDialect, stepID string) ([]domain.Field, error) {
	var fields []domain.Field
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
			typePart = parts[1]
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
			StepID:       stepID,
		}
		if key, ok := ContextKeyFromFieldType(typePart); ok {
			field.ContextKey = key
			field.Hidden = true
		}
		if !d.allowLookups && fieldUsesLookup(typePart) {
			return nil, fmt.Errorf("tipo LOOKUP não suportado em módulos %s (campo %s)", d.kind, fieldName)
		}
		fields = append(fields, field)
	}
	return fields, nil
}

func stepResultTypeTagRegex(prefix string) *regexp.Regexp {
	return regexp.MustCompile(`(?m)^\s*` + regexp.QuoteMeta(prefix) + `\s*RESULT_TYPE=(.*)$`)
}

func parseStepBlocks(content string, d metadataDialect, moduleDefaultResult string) ([]StepDefinition, error) {
	re := stepBlockRegexFor(d.linePrefix)
	matches := re.FindAllStringSubmatch(content, -1)
	if len(matches) == 0 {
		return nil, nil
	}

	labels := parseWizardLabels(content, d.linePrefix)
	byID := make(map[string]StepDefinition)
	orderInFile := make([]string, 0, len(matches))

	for _, match := range matches {
		if len(match) < 3 {
			continue
		}
		stepID := strings.TrimSpace(match[1])
		inner := match[2]

		propMatch := d.propertiesRegex.FindStringSubmatch(inner)
		if len(propMatch) < 2 {
			return nil, fmt.Errorf("step %s sem bloco PROPERTIES", stepID)
		}
		propertiesBlock := propMatch[1]

		fields, err := parseFieldsFromPropertiesBlock(propertiesBlock, d, stepID)
		if err != nil {
			return nil, err
		}

		rest := d.propertiesRegex.ReplaceAllString(inner, "")
		body := strings.TrimSpace(rest)
		rt := moduleDefaultResult
		if rtMatch := stepResultTypeTagRegex(d.linePrefix).FindStringSubmatch(body); len(rtMatch) > 1 {
			rt = NormalizeResultType(rtMatch[1])
			body = stepResultTypeTagRegex(d.linePrefix).ReplaceAllString(body, "")
			body = strings.TrimSpace(body)
		}

		label := stepID
		if l, ok := labels[stepID]; ok && l != "" {
			label = l
		}

		hasQuery := strings.TrimSpace(body) != ""
		orderInFile = append(orderInFile, stepID)
		byID[stepID] = StepDefinition{
			ID:              stepID,
			Label:           label,
			Fields:          fields,
			Body:            body,
			PropertiesBlock: propertiesBlock,
			ResultType:      rt,
			HasQuery:        hasQuery,
		}
	}

	orderedIDs := orderInFile
	if labels != nil && len(labels) > 0 {
		seen := make(map[string]bool)
		orderedIDs = nil
		wizardRe := wizardBlockRegexFor(d.linePrefix)
		if wm := wizardRe.FindStringSubmatch(content); len(wm) > 1 {
			for _, line := range strings.Split(wm[1], "\n") {
				line = strings.TrimSpace(line)
				if !isLineComment(line, d.linePrefix) {
					continue
				}
				trimmed := strings.TrimSpace(strings.TrimPrefix(line, d.linePrefix))
				sub := wizardStepLineRegex.FindStringSubmatch(trimmed)
				if len(sub) < 2 {
					continue
				}
				id := sub[1]
				if _, ok := byID[id]; !ok {
					return nil, fmt.Errorf("WIZARD referencia step inexistente %q", id)
				}
				if !seen[id] {
					seen[id] = true
					orderedIDs = append(orderedIDs, id)
				}
			}
		}
		for _, id := range orderInFile {
			if !seen[id] {
				orderedIDs = append(orderedIDs, id)
			}
		}
	}

	steps := make([]StepDefinition, 0, len(orderedIDs))
	seenFields := make(map[string]string)
	for _, id := range orderedIDs {
		st := byID[id]
		for _, f := range st.Fields {
			if prev, dup := seenFields[f.Field]; dup {
				return nil, fmt.Errorf("campo duplicado %q em steps %s e %s", f.Field, prev, id)
			}
			seenFields[f.Field] = id
		}
		steps = append(steps, st)
	}
	return steps, nil
}

func (p *SQLParser) HasWizard() bool {
	return p != nil && p.WizardEnabled && len(p.Steps) > 0
}

func (p *SQLParser) StepByID(id string) (*StepDefinition, bool) {
	if p == nil {
		return nil, false
	}
	for i := range p.Steps {
		if strings.EqualFold(p.Steps[i].ID, id) {
			return &p.Steps[i], true
		}
	}
	return nil, false
}

func (p *SQLParser) LastStepID() string {
	if p == nil || len(p.Steps) == 0 {
		return ""
	}
	return p.Steps[len(p.Steps)-1].ID
}

func (p *SQLParser) WizardMetadata() *domain.WizardMetadata {
	if !p.HasWizard() {
		return nil
	}
	meta := &domain.WizardMetadata{Steps: make([]domain.WizardStepMeta, 0, len(p.Steps))}
	for _, st := range p.Steps {
		names := make([]string, 0, len(st.Fields))
		for _, f := range st.Fields {
			if !f.Hidden {
				names = append(names, f.Field)
			}
		}
		meta.Steps = append(meta.Steps, domain.WizardStepMeta{
			ID:         st.ID,
			Label:      st.Label,
			HasQuery:   st.HasQuery,
			ResultType: st.ResultType,
			FieldNames: names,
		})
	}
	return meta
}

func (p *SQLParser) ResultTypeForStep(stepID string) string {
	if st, ok := p.StepByID(stepID); ok && st.ResultType != "" {
		return st.ResultType
	}
	if p != nil && p.ResultType != "" {
		return p.ResultType
	}
	return "GRID"
}

// StripWizardBlocks removes WIZARD metadata blocks from module content.
func StripWizardBlocks(content, linePrefix string) string {
	return wizardBlockRegexFor(linePrefix).ReplaceAllString(content, "")
}

// StripAllStepBlocks removes every STEP block from content.
func StripAllStepBlocks(content, linePrefix string) string {
	return stepBlockRegexFor(linePrefix).ReplaceAllString(content, "")
}

func extractResidualSQL(content string, d metadataDialect) string {
	out := content
	out = StripLookupBlocks(out)
	out = StripWizardBlocks(out, d.linePrefix)
	out = StripAllStepBlocks(out, d.linePrefix)
	out = d.propertiesRegex.ReplaceAllString(out, "")
	// Strip header tags
	for _, tag := range []string{"SERVER", "TIMEOUT", "DESCRIPTION", "EXECUTE_MODE", "RESULT_TYPE", "INCLUDE"} {
		out = tagRegex(d.linePrefix, tag).ReplaceAllString(out, "")
	}
	out = stripSqlServerDeclareBlock(out)
	return strings.TrimSpace(out)
}

// InjectStepValues prepares SQL for executing a single wizard step.
func InjectStepValues(fileContent, stepID, moduleKind string, values map[string]interface{}, fields []domain.Field, moduleDefaultResult, driver string) (string, error) {
	d := dialectForKind(moduleKind)

	parserSteps, err := parseStepBlocks(fileContent, d, moduleDefaultResult)
	if err != nil {
		return "", err
	}
	var step *StepDefinition
	for i := range parserSteps {
		if strings.EqualFold(parserSteps[i].ID, stepID) {
			step = &parserSteps[i]
			break
		}
	}
	if step == nil {
		return "", fmt.Errorf("step %q não encontrado", stepID)
	}

	isLast := len(parserSteps) > 0 && strings.EqualFold(parserSteps[len(parserSteps)-1].ID, stepID)

	sqlContent := StripLookupBlocks(fileContent)
	sqlContent = StripWizardBlocks(sqlContent, d.linePrefix)
	sqlContent = applyConditionalComments(sqlContent, values, fields)

	// Remove all STEP blocks except we rebuild active step SQL manually.
	sqlContent = StripAllStepBlocks(sqlContent, d.linePrefix)
	sqlContent = d.propertiesRegex.ReplaceAllString(sqlContent, "")

	body := strings.TrimSpace(step.Body)
	if body == "" && isLast {
		body = extractResidualSQL(fileContent, d)
	}
	if body == "" {
		return "", nil
	}

	prefixes := collectFieldPrefixesFromContent(fileContent, d)
	injectionBlock := buildInjectionBlockWithPrefixes(values, fields, "", prefixes)

	var execSQL string
	if isPostgresDriver(driver) {
		execSQL = body
	} else {
		declareBlock := extractSqlServerDeclareBlock(fileContent)
		var parts []string
		if declareBlock != "" {
			parts = append(parts, declareBlock)
		}
		if injectionBlock != "" {
			parts = append(parts, injectionBlock)
		}
		parts = append(parts, body)
		execSQL = strings.Join(parts, "\n")
	}

	return execSQL, nil
}

func collectFieldPrefixesFromContent(content string, d metadataDialect) map[string]string {
	prefixes := make(map[string]string)
	re := stepBlockRegexFor(d.linePrefix)
	for _, match := range re.FindAllStringSubmatch(content, -1) {
		if len(match) < 3 {
			continue
		}
		inner := match[2]
		propMatch := d.propertiesRegex.FindStringSubmatch(inner)
		if len(propMatch) < 2 {
			continue
		}
		mergeFieldPrefixes(propMatch[1], prefixes)
	}
	if propMatch := d.propertiesRegex.FindStringSubmatch(content); len(propMatch) > 1 {
		mergeFieldPrefixes(propMatch[1], prefixes)
	}
	return prefixes
}

func mergeFieldPrefixes(propertiesBlock string, into map[string]string) {
	lines := strings.Split(propertiesBlock, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		line = strings.TrimPrefix(line, "--")
		line = strings.TrimPrefix(line, "#")
		line = strings.TrimSpace(line)
		if line == "" || !strings.Contains(line, "?") {
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
		symbolIdx := strings.IndexAny(fieldPart, "@?#")
		var rawPrefix string
		if symbolIdx != -1 {
			rawPrefix = fieldPart[:symbolIdx]
		} else {
			rawPrefix = fieldPart
		}
		cleanPrefix := strings.TrimPrefix(strings.TrimSpace(rawPrefix), "--")
		cleanPrefix = strings.TrimPrefix(cleanPrefix, "#")
		cleanPrefix = strings.TrimSpace(cleanPrefix)
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
		into[fieldName] = cleanPrefix
	}
}

func buildInjectionBlockWithPrefixes(values map[string]interface{}, fields []domain.Field, skipField string, fieldPrefixes map[string]string) string {
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

		cleanPrefix, hasPrefix := fieldPrefixes[field.Field]
		if !hasPrefix {
			cleanPrefix = "SELECT @"
		}
		isVariableAssignment := strings.Contains(cleanPrefix, "@")
		if !isVariableAssignment && !field.Required && valStr == "" {
			continue
		}

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