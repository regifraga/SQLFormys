package engine

import (
	"regexp"
	"strings"

	"sqlformys/internal/domain"
)

var contextFieldTypeRegex = regexp.MustCompile(`(?i)^CONTEXT\(([^)]+)\)`)

// ContextKeyFromFieldType extracts the context key from CONTEXT(Key).
func ContextKeyFromFieldType(fieldType string) (string, bool) {
	match := contextFieldTypeRegex.FindStringSubmatch(strings.TrimSpace(fieldType))
	if len(match) < 2 {
		return "", false
	}
	key := strings.TrimSpace(match[1])
	if key == "" {
		return "", false
	}
	return key, true
}

// IsContextField reports whether the field is filled from session context instead of the form.
func IsContextField(field domain.Field) bool {
	return field.Hidden && field.ContextKey != ""
}

const (
	UserTypeAdministrator = "Administrator"
	UserTypeStandard      = "Standard"
)

// ContextSession holds trusted request-scoped values for CONTEXT fields.
type ContextSession struct {
	Username string
	IsAdmin  bool
}

func resolveContextValue(contextKey string, sess ContextSession) string {
	key := strings.TrimSpace(contextKey)
	switch {
	case strings.EqualFold(key, "USER_NAME"):
		return strings.TrimSpace(sess.Username)
	case strings.EqualFold(key, "USER_TYPE"):
		if sess.IsAdmin {
			return UserTypeAdministrator
		}
		return UserTypeStandard
	default:
		return ""
	}
}

// ApplyContextValues overwrites payload entries for CONTEXT fields using trusted session data.
func ApplyContextValues(fields []domain.Field, payload map[string]interface{}, sess ContextSession) {
	if payload == nil {
		return
	}
	for _, field := range fields {
		if !IsContextField(field) {
			continue
		}
		val := resolveContextValue(field.ContextKey, sess)
		payload[field.Field] = val
	}
}
