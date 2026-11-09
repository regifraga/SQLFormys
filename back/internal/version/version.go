package version

import (
	_ "embed"
	"strings"
)

//go:embed VERSION
var versionFile string

const AppName = "SQLFormys"

// Version returns the application semver from VERSION (embedded at build time).
func Version() string {
	return strings.TrimSpace(versionFile)
}
