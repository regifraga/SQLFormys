package filesafe

import (
	"fmt"
	"path/filepath"
	"strings"
)

// ResolveUnderBase joins rel to base and ensures the result stays under base.
func ResolveUnderBase(base, rel string) (string, error) {
	rel = strings.TrimSpace(rel)
	rel = strings.Trim(rel, "/\\")
	if rel == "" {
		return base, nil
	}
	if strings.Contains(rel, "..") {
		return "", fmt.Errorf("caminho inválido")
	}
	clean := filepath.Clean(filepath.Join(base, filepath.FromSlash(rel)))
	absBase, err := filepath.Abs(base)
	if err != nil {
		return "", err
	}
	absClean, err := filepath.Abs(clean)
	if err != nil {
		return "", err
	}
	prefix := absBase + string(filepath.Separator)
	if absClean != absBase && !strings.HasPrefix(absClean, prefix) {
		return "", fmt.Errorf("caminho fora da área permitida")
	}
	return clean, nil
}
