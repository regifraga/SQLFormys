package engine

import (
	"regexp"
	"strings"
)

var interpolateTokenRegex = regexp.MustCompile(`\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}`)

// Interpolate replaces {{FIELD}} tokens in text with values from values when FIELD
// is listed in knownFields. Unknown field names are left unchanged. Empty values
// replace with an empty string.
func Interpolate(text string, values map[string]string, knownFields []string) string {
	if text == "" || !strings.Contains(text, "{{") {
		return text
	}
	known := make(map[string]struct{}, len(knownFields))
	for _, f := range knownFields {
		known[f] = struct{}{}
	}
	return interpolateTokenRegex.ReplaceAllStringFunc(text, func(token string) string {
		sub := interpolateTokenRegex.FindStringSubmatch(token)
		if len(sub) < 2 {
			return token
		}
		name := sub[1]
		if _, ok := known[name]; !ok {
			return token
		}
		return values[name]
	})
}