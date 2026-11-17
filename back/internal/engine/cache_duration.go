package engine

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const maxCacheDuration = 24 * time.Hour

var cacheDurationRegex = regexp.MustCompile(`(?i)^(\d+)([smh])$`)

// ParseCacheArg accepts "30s" or "CACHE=30s" (case-insensitive CACHE prefix).
func ParseCacheArg(raw string) (time.Duration, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, fmt.Errorf("duração de cache vazia")
	}
	if strings.HasPrefix(strings.ToUpper(raw), "CACHE=") {
		raw = strings.TrimSpace(raw[6:])
	}
	return ParseCacheDuration(raw)
}

// ParseCacheDuration parses a TTL such as 15s, 1m, or 2h.
func ParseCacheDuration(raw string) (time.Duration, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, fmt.Errorf("duração de cache vazia")
	}
	m := cacheDurationRegex.FindStringSubmatch(raw)
	if m == nil {
		return 0, fmt.Errorf("duração de cache inválida %q (use ex.: 15s, 1m, 2h)", raw)
	}
	n, err := strconv.Atoi(m[1])
	if err != nil || n <= 0 {
		return 0, fmt.Errorf("duração de cache inválida %q", raw)
	}
	unit := strings.ToLower(m[2])
	var d time.Duration
	switch unit {
	case "s":
		d = time.Duration(n) * time.Second
	case "m":
		d = time.Duration(n) * time.Minute
	case "h":
		d = time.Duration(n) * time.Hour
	default:
		return 0, fmt.Errorf("duração de cache inválida %q", raw)
	}
	if d > maxCacheDuration {
		return 0, fmt.Errorf("duração de cache %q excede o máximo de 24h", raw)
	}
	return d, nil
}

// FormatCacheDuration serializes a duration for metadata (15s, 1m, 2h).
func FormatCacheDuration(d time.Duration) string {
	if d <= 0 {
		return ""
	}
	if d%(time.Hour) == 0 && d >= time.Hour {
		return fmt.Sprintf("%dh", int(d/time.Hour))
	}
	if d%(time.Minute) == 0 && d >= time.Minute {
		return fmt.Sprintf("%dm", int(d/time.Minute))
	}
	sec := int(d / time.Second)
	if sec > 0 {
		return fmt.Sprintf("%ds", sec)
	}
	return fmt.Sprintf("%ds", 1)
}