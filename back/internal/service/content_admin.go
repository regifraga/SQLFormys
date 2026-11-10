package service

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"sqlformys/internal/filesafe"
)

type ContentAdmin struct{}

func NewContentAdmin() *ContentAdmin {
	return &ContentAdmin{}
}

func (c *ContentAdmin) ReadSQL(basePath, rel string) (string, error) {
	target, err := filesafe.ResolveUnderBase(basePath, rel+".sql")
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(target)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (c *ContentAdmin) WriteSQL(basePath, rel, content string) error {
	target, err := filesafe.ResolveUnderBase(basePath, rel+".sql")
	if err != nil {
		return err
	}
	dir := filepath.Dir(target)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(target, []byte(content), 0o644)
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
