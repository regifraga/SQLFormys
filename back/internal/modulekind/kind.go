package modulekind

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	KindSQL = "sql"
	KindSH  = "sh"
	KindPS1 = "ps1"
)

var extByKind = map[string]string{
	KindSQL: ".sql",
	KindSH:  ".sh",
	KindPS1: ".ps1",
}

var kindByExt = map[string]string{
	".sql": KindSQL,
	".sh":  KindSH,
	".ps1": KindPS1,
}

// ModuleExtensions lists script module file suffixes in discovery order.
var ModuleExtensions = []string{".sql", ".sh", ".ps1"}

// NormalizeKind returns a supported kind or empty string.
func NormalizeKind(kind string) string {
	k := strings.ToLower(strings.TrimSpace(kind))
	switch k {
	case KindSQL, KindSH, KindPS1:
		return k
	default:
		return ""
	}
}

// ExtForKind returns the file extension (including dot) for a kind.
func ExtForKind(kind string) (string, error) {
	ext, ok := extByKind[NormalizeKind(kind)]
	if !ok {
		return "", fmt.Errorf("tipo de módulo inválido: %q", kind)
	}
	return ext, nil
}

// KindFromExt returns kind for a file extension (e.g. ".sh").
func KindFromExt(ext string) (string, bool) {
	k, ok := kindByExt[strings.ToLower(ext)]
	return k, ok
}

func ensureAbsPath(p string) (string, error) {
	p = filepath.Clean(p)
	if filepath.IsAbs(p) {
		return p, nil
	}
	return filepath.Abs(p)
}

// ResolveModule locates the on-disk module file for a logical path and optional kind.
// If kind is empty, exactly one matching file must exist or an error is returned.
func ResolveModule(basePath, logicalPath, kind string) (absPath string, resolvedKind string, err error) {
	logicalPath = strings.Trim(strings.TrimSpace(logicalPath), "/\\")
	if logicalPath == "" {
		return "", "", fmt.Errorf("caminho do módulo vazio")
	}

	basePath, err = ensureAbsPath(basePath)
	if err != nil {
		return "", "", fmt.Errorf("base de queries inválida: %w", err)
	}

	kind = NormalizeKind(kind)
	if kind != "" {
		ext, err := ExtForKind(kind)
		if err != nil {
			return "", "", err
		}
		rel := logicalPath + ext
		abs := filepath.Join(basePath, rel)
		if _, statErr := os.Stat(abs); statErr != nil {
			if os.IsNotExist(statErr) {
				return "", "", fmt.Errorf("módulo não encontrado: %s", rel)
			}
			return "", "", statErr
		}
		abs, err = ensureAbsPath(abs)
		if err != nil {
			return "", "", err
		}
		return abs, kind, nil
	}

	var found []struct {
		path string
		kind string
	}
	for _, ext := range ModuleExtensions {
		rel := logicalPath + ext
		abs := filepath.Join(basePath, rel)
		if _, statErr := os.Stat(abs); statErr == nil {
			k, _ := KindFromExt(ext)
			found = append(found, struct {
				path string
				kind string
			}{abs, k})
		}
	}
	switch len(found) {
	case 0:
		return "", "", fmt.Errorf("módulo não encontrado: %s", logicalPath)
	case 1:
		abs, err := ensureAbsPath(found[0].path)
		if err != nil {
			return "", "", err
		}
		return abs, found[0].kind, nil
	default:
		return "", "", fmt.Errorf("módulo ambíguo %q: especifique ?kind=sql, sh ou ps1", logicalPath)
	}
}

// BasenameConflict checks whether any module file with the same basename exists in the parent directory.
func BasenameConflict(basePath, logicalPath string) bool {
	dir := filepath.Dir(logicalPath)
	name := filepath.Base(logicalPath)
	if dir == "." {
		dir = ""
	}
	parent := basePath
	if dir != "" {
		parent = filepath.Join(basePath, dir)
	}
	for _, ext := range ModuleExtensions {
		if _, err := os.Stat(filepath.Join(parent, name+ext)); err == nil {
			return true
		}
	}
	return false
}
