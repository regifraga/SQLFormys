package engine

import (
	"fmt"
	"regexp"
	"strings"

	"sqlformys/internal/domain"
)

func namedQueryBlockRegexFor(prefix string) *regexp.Regexp {
	p := regexp.QuoteMeta(prefix)
	// Closing tag: --</QUERY>, --<QUERY> ou --<QUERY> (com ou sem '>' no fim).
	close := p + `\s*(?:</QUERY>\s*>?|<QUERY>\s*>?)`
	return regexp.MustCompile(`(?si)` + p + `\s*<QUERY\s+([A-Za-z][A-Za-z0-9_]*)\s*>?\s*(.*?)\s*` + close)
}

var (
	queryRefLineRegex          = regexp.MustCompile(`(?i)^QUERY\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)\s*$`)
	moduleQueryDirectiveRegex  = regexp.MustCompile(`(?m)^\s*` + regexp.QuoteMeta("--") + `\s*QUERY\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)\s*$`)
	moduleQueryDirectiveRegexH = regexp.MustCompile(`(?m)^\s*` + regexp.QuoteMeta("#") + `\s*QUERY\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)\s*$`)
	resultTypeNamedQueryRegex  = regexp.MustCompile(`(?i)^([A-Za-z]+)(?:\s+QUERY\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\))?\s*$`)
)

// ParseNamedQueryBlocks returns map name -> executable SQL body.
func ParseNamedQueryBlocks(content, linePrefix string) (map[string]string, error) {
	re := namedQueryBlockRegexFor(linePrefix)
	matches := re.FindAllStringSubmatch(content, -1)
	if len(matches) == 0 {
		return nil, nil
	}
	out := make(map[string]string)
	seen := make(map[string]string)
	for _, m := range matches {
		if len(m) < 3 {
			continue
		}
		name := strings.TrimSpace(m[1])
		inner := normalizeNamedQueryBody(m[2], linePrefix)
		key := strings.ToUpper(name)
		if prev, dup := seen[key]; dup {
			return nil, fmt.Errorf("bloco QUERY duplicado %q (já definido como %q)", name, prev)
		}
		seen[key] = name
		out[name] = inner
	}
	return out, nil
}

func normalizeNamedQueryBody(inner, linePrefix string) string {
	var lines []string
	for _, line := range strings.Split(inner, "\n") {
		line = strings.TrimRight(line, "\r")
		s := strings.TrimSpace(line)
		if s == "" {
			lines = append(lines, "")
			continue
		}
		if isLineComment(s, linePrefix) {
			s = strings.TrimSpace(strings.TrimPrefix(s, linePrefix))
		}
		lines = append(lines, s)
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

// StripNamedQueryBlocks removes named QUERY blocks so they are not executed inline.
func StripNamedQueryBlocks(content, linePrefix string) string {
	out := namedQueryBlockRegexFor(linePrefix).ReplaceAllString(content, "")
	return stripModuleQueryDirectives(out, linePrefix)
}

func stripModuleQueryDirectives(content, linePrefix string) string {
	if linePrefix == "#" {
		return moduleQueryDirectiveRegexH.ReplaceAllString(content, "")
	}
	return moduleQueryDirectiveRegex.ReplaceAllString(content, "")
}

func parseModuleQueryDirective(content, linePrefix string) string {
	var re *regexp.Regexp
	if linePrefix == "#" {
		re = moduleQueryDirectiveRegexH
	} else {
		re = moduleQueryDirectiveRegex
	}
	if m := re.FindStringSubmatch(content); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

func parseResultTypeAndQueryRef(raw string) (resultType, queryName string) {
	raw = strings.TrimSpace(raw)
	if m := resultTypeNamedQueryRegex.FindStringSubmatch(raw); len(m) >= 2 {
		return strings.TrimSpace(m[1]), strings.TrimSpace(m[2])
	}
	return raw, ""
}

// QueryReferenceFromBody detects a single QUERY(Name) reference in a step/residual body.
func QueryReferenceFromBody(body, linePrefix string) (string, bool) {
	body = strings.TrimSpace(body)
	if body == "" {
		return "", false
	}
	var nonEmpty []string
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(strings.TrimPrefix(strings.TrimRight(line, "\r"), ""))
		if line == "" {
			continue
		}
		s := strings.TrimSpace(line)
		if isLineComment(s, linePrefix) {
			s = strings.TrimSpace(strings.TrimPrefix(s, linePrefix))
		}
		nonEmpty = append(nonEmpty, s)
	}
	if len(nonEmpty) != 1 {
		return "", false
	}
	if m := queryRefLineRegex.FindStringSubmatch(nonEmpty[0]); len(m) >= 2 {
		return strings.TrimSpace(m[1]), true
	}
	return "", false
}

func (p *SQLParser) NamedQuerySQL(name string) (string, bool) {
	if p == nil || p.NamedQueries == nil {
		return "", false
	}
	if sql, ok := p.NamedQueries[name]; ok {
		return sql, true
	}
	for key, sql := range p.NamedQueries {
		if strings.EqualFold(key, name) {
			return sql, true
		}
	}
	return "", false
}

func resolveNamedQuerySQL(p *SQLParser, names ...string) (string, error) {
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		sql, ok := p.NamedQuerySQL(name)
		if !ok || strings.TrimSpace(sql) == "" {
			return "", fmt.Errorf("QUERY %q não encontrado no módulo", name)
		}
		return sql, nil
	}
	return "", nil
}

// ResolveExecutionSQL picks the SQL to run: explicit body, QUERY(Name), module directive, or RESULT_TYPE suffix.
func (p *SQLParser) ResolveExecutionSQL(body, linePrefix string) (string, error) {
	body = strings.TrimSpace(body)
	if name, ok := QueryReferenceFromBody(body, linePrefix); ok {
		return resolveNamedQuerySQL(p, name)
	}
	if body != "" {
		return body, nil
	}
	if p == nil {
		return "", nil
	}
	if sql, err := resolveNamedQuerySQL(p, p.ModuleQueryRef, p.ResultTypeQueryRef); err != nil {
		return "", err
	} else if sql != "" {
		return sql, nil
	}
	return "", nil
}

// ExpandQueryReferences substitutes QUERY(Name) lines and resolves empty bodies to a named query.
func ExpandQueryReferences(sqlContent string, p *SQLParser, linePrefix string) (string, error) {
	if p == nil {
		return sqlContent, nil
	}
	trimmed := strings.TrimSpace(sqlContent)
	if trimmed == "" {
		resolved, err := p.ResolveExecutionSQL("", linePrefix)
		if err != nil {
			return "", err
		}
		return resolved, nil
	}
	if name, ok := QueryReferenceFromBody(trimmed, linePrefix); ok {
		return resolveNamedQuerySQL(p, name)
	}

	var out []string
	replaced := false
	for _, line := range strings.Split(sqlContent, "\n") {
		raw := strings.TrimRight(line, "\r")
		s := strings.TrimSpace(raw)
		check := s
		if isLineComment(check, linePrefix) {
			check = strings.TrimSpace(strings.TrimPrefix(check, linePrefix))
		}
		if m := queryRefLineRegex.FindStringSubmatch(check); len(m) >= 2 {
			sql, err := resolveNamedQuerySQL(p, m[1])
			if err != nil {
				return "", err
			}
			for _, sub := range strings.Split(sql, "\n") {
				out = append(out, sub)
			}
			replaced = true
			continue
		}
		out = append(out, raw)
	}
	if !replaced {
		return sqlContent, nil
	}
	return strings.Join(out, "\n"), nil
}

// InjectNamedQueryValues prepares a named QUERY block like the main module query.
func InjectNamedQueryValues(fileContent, querySQL, moduleKind string, values map[string]interface{}, fields []domain.Field, driver string) string {
	d := dialectForKind(moduleKind)
	return assembleWizardStepSQL(fileContent, querySQL, moduleKind, values, fields, driver, d, false)
}