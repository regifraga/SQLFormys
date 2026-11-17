package engine

import (
	"fmt"
	"regexp"
	"strings"

	"sqlformys/internal/domain"
)

func messageDirectiveLineRegex(prefix string) *regexp.Regexp {
	p := regexp.QuoteMeta(prefix)
	return regexp.MustCompile(`^\s*` + p + `MESSAGE(?:\s*=\s*(.*))?\s*$`)
}

var wizardMessageValidateOpt = `(?:VALIDATE\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)\s+)?`

var wizardMessageFinishRegex = regexp.MustCompile(`(?i)^MESSAGE\s+FINISH\s+` + wizardMessageValidateOpt + `(CONFIRM|WARNING|DANGER)\s*:\s*(.+)$`)
var wizardMessageStepRegex = regexp.MustCompile(`(?i)^MESSAGE\s+([A-Za-z][A-Za-z0-9_]*)\s+(ENTER|EXIT)\s+` + wizardMessageValidateOpt + `(CONFIRM|WARNING|DANGER)\s*:\s*(.+)$`)

func parseMessageTypeAndBody(raw string) (msgType, message string, ok bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "WARNING", "", true
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
	if typeNorm == "" {
		typeNorm = "WARNING"
	}
	if _, valid := confirmTypes[typeNorm]; !valid {
		return "", "", false
	}
	return typeNorm, msgPart, true
}

func parseModuleMessageDirectives(content, prefix string) ([]domain.UserMessage, error) {
	re := messageDirectiveLineRegex(prefix)
	var out []domain.UserMessage
	for _, line := range strings.Split(content, "\n") {
		m := re.FindStringSubmatch(line)
		if len(m) == 0 {
			continue
		}
		raw := ""
		if len(m) > 1 {
			raw = strings.TrimSpace(m[1])
		}
		mt, msg, ok := parseMessageTypeAndBody(raw)
		if !ok {
			return nil, fmt.Errorf("diretiva MESSAGE inválida")
		}
		out = append(out, domain.UserMessage{
			When:    "load",
			Type:    mt,
			Message: msg,
		})
	}
	return out, nil
}

func parseWizardMessages(content, linePrefix string, stepIDs map[string]string) ([]domain.UserMessage, error) {
	re := wizardBlockRegexFor(linePrefix)
	match := re.FindStringSubmatch(content)
	if len(match) < 2 {
		return nil, nil
	}
	var out []domain.UserMessage
	for _, line := range strings.Split(match[1], "\n") {
		line = strings.TrimSpace(line)
		if !isLineComment(line, linePrefix) {
			continue
		}
		trimmed := strings.TrimSpace(strings.TrimPrefix(line, linePrefix))
		if m := wizardMessageFinishRegex.FindStringSubmatch(trimmed); len(m) >= 3 {
			um := domain.UserMessage{
				When:    "finish",
				Type:    strings.ToUpper(m[2]),
				Message: strings.TrimSpace(m[3]),
			}
			if len(m) > 1 && strings.TrimSpace(m[1]) != "" {
				um.ValidateQueryName = strings.TrimSpace(m[1])
			}
			out = append(out, um)
			continue
		}
		if m := wizardMessageStepRegex.FindStringSubmatch(trimmed); len(m) >= 5 {
			stepID := m[1]
			when := strings.ToLower(m[2])
			if _, ok := stepIDs[strings.ToUpper(stepID)]; !ok {
				return nil, fmt.Errorf("MESSAGE referencia step inexistente %q", stepID)
			}
			um := domain.UserMessage{
				When:    when,
				StepID:  stepIDs[strings.ToUpper(stepID)],
				Type:    strings.ToUpper(m[4]),
				Message: strings.TrimSpace(m[5]),
			}
			if len(m) > 3 && strings.TrimSpace(m[3]) != "" {
				um.ValidateQueryName = strings.TrimSpace(m[3])
			}
			out = append(out, um)
		}
	}
	return out, nil
}

// StripMessageDirectives removes MESSAGE header lines from module content.
func StripMessageDirectives(content, prefix string) string {
	re := messageDirectiveLineRegex(prefix)
	var lines []string
	for _, line := range strings.Split(content, "\n") {
		if re.MatchString(line) {
			continue
		}
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n")
}

func (p *SQLParser) ModuleMessages() []domain.UserMessage {
	if p == nil || len(p.Messages) == 0 {
		return nil
	}
	return append([]domain.UserMessage(nil), p.Messages...)
}