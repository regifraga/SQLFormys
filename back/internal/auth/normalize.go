package auth

import "strings"

// NormalizeLogin compares usernames case-insensitively using the short name.
func NormalizeLogin(username string) string {
	return strings.ToLower(strings.TrimSpace(DisplayNameFromUsername(username)))
}
