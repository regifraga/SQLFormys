package engine

import (
	"fmt"
	"os"
	"strings"

	"sqlformys/internal/library"
	"sqlformys/internal/modulekind"
)

const maxIncludeDepth = 16

// ExpandIncludes replaces every INCLUDE header line with the contents of the referenced library module (same kind).
func ExpandIncludes(basePath, content, kind string) (string, error) {
	kind = modulekind.NormalizeKind(kind)
	if kind == "" {
		kind = modulekind.KindSQL
	}
	return expandIncludesRec(basePath, content, kind, nil, 0)
}

func normalizeIncludeRef(ref, kind string) string {
	ref = strings.Trim(strings.TrimSpace(ref), "/\\")
	if ref == "" {
		return ref
	}
	ext, err := modulekind.ExtForKind(kind)
	if err != nil {
		return ref
	}
	if strings.HasSuffix(strings.ToLower(ref), ext) {
		return strings.TrimSuffix(ref, ext)
	}
	// wrong extension on purpose — leave for ResolveModule to fail
	return ref
}

func expandIncludesRec(basePath, content, kind string, stack []string, depth int) (string, error) {
	if depth > maxIncludeDepth {
		return "", fmt.Errorf("INCLUDE: profundidade máxima (%d) excedida", maxIncludeDepth)
	}
	d := dialectForKind(kind)
	re := tagRegex(d.linePrefix, "INCLUDE")

	for {
		loc := re.FindStringIndex(content)
		if loc == nil {
			return content, nil
		}
		match := content[loc[0]:loc[1]]
		sub := re.FindStringSubmatch(match)
		if len(sub) < 2 {
			return "", fmt.Errorf("INCLUDE inválido")
		}
		relPath := normalizeIncludeRef(sub[1], kind)
		if relPath == "" {
			return "", fmt.Errorf("INCLUDE: caminho vazio")
		}
		if strings.Contains(relPath, "..") {
			return "", fmt.Errorf("INCLUDE %q: caminho inválido", relPath)
		}
		if !library.IsLibraryModule(basePath, relPath) {
			return "", fmt.Errorf("INCLUDE %q: módulo deve estar em uma pasta Biblioteca", relPath)
		}
		for _, s := range stack {
			if s == relPath {
				return "", fmt.Errorf("INCLUDE: ciclo detectado em %q", relPath)
			}
		}
		abs, resolvedKind, err := modulekind.ResolveModule(basePath, relPath, kind)
		if err != nil {
			return "", fmt.Errorf("INCLUDE %q: %w", relPath, err)
		}
		if resolvedKind != kind {
			return "", fmt.Errorf("INCLUDE %q: tipo %s incompatível com módulo %s", relPath, resolvedKind, kind)
		}
		data, err := os.ReadFile(abs)
		if err != nil {
			return "", fmt.Errorf("INCLUDE %q: %w", relPath, err)
		}
		nested, err := expandIncludesRec(basePath, string(data), kind, append(stack, relPath), depth+1)
		if err != nil {
			return "", err
		}
		content = content[:loc[0]] + nested + content[loc[1]:]
	}
}