package service

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"sqlformys/internal/filesafe"
	"sqlformys/internal/modulekind"
)

type ContentAdmin struct{}

func NewContentAdmin() *ContentAdmin {
	return &ContentAdmin{}
}

func (c *ContentAdmin) ReadModule(basePath, rel, kind string) (string, string, error) {
	abs, resolvedKind, err := modulekind.ResolveModule(basePath, rel, kind)
	if err != nil {
		return "", "", err
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		return "", "", err
	}
	return string(data), resolvedKind, nil
}

func (c *ContentAdmin) WriteModule(basePath, rel, kind, content string) error {
	kind = modulekind.NormalizeKind(kind)
	if kind == "" {
		kind = modulekind.KindSQL
	}
	ext, err := modulekind.ExtForKind(kind)
	if err != nil {
		return err
	}
	target, err := filesafe.ResolveUnderBase(basePath, rel+ext)
	if err != nil {
		return err
	}
	if _, statErr := os.Stat(target); os.IsNotExist(statErr) {
		if modulekind.BasenameConflict(basePath, rel) {
			return fmt.Errorf("já existe um módulo com este nome nesta pasta")
		}
	}
	dir := filepath.Dir(target)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(target, []byte(content), 0o644)
}

// ReadSQL reads a module for admin (backward name); kind optional via query param.
func (c *ContentAdmin) ReadSQL(basePath, rel, kind string) (string, error) {
	content, _, err := c.ReadModule(basePath, rel, kind)
	return content, err
}

// WriteSQL writes a module; kind defaults to sql.
func (c *ContentAdmin) WriteSQL(basePath, rel, kind, content string) error {
	return c.WriteModule(basePath, rel, kind, content)
}

func (c *ContentAdmin) CreateFolder(basePath, rel string) error {
	target, err := filesafe.ResolveUnderBase(basePath, rel)
	if err != nil {
		return err
	}
	info, err := os.Stat(target)
	if err == nil && !info.IsDir() {
		return fmt.Errorf("já existe um arquivo com este nome")
	}
	if err == nil {
		return nil
	}
	return os.MkdirAll(target, 0o755)
}

func (c *ContentAdmin) RenameFolder(basePath, fromRel, toRel string) error {
	fromRel = strings.Trim(strings.TrimSpace(fromRel), "/\\")
	toRel = strings.Trim(strings.TrimSpace(toRel), "/\\")
	if fromRel == "" || toRel == "" {
		return fmt.Errorf("caminhos inválidos")
	}
	from, err := filesafe.ResolveUnderBase(basePath, fromRel)
	if err != nil {
		return err
	}
	to, err := filesafe.ResolveUnderBase(basePath, toRel)
	if err != nil {
		return err
	}
	info, err := os.Stat(from)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("origem não é uma pasta")
	}
	if _, err := os.Stat(to); err == nil {
		return fmt.Errorf("destino já existe")
	}
	if err := os.MkdirAll(filepath.Dir(to), 0o755); err != nil {
		return err
	}
	return os.Rename(from, to)
}
