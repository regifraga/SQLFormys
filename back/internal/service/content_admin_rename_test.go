package service

import (
	"os"
	"path/filepath"
	"testing"

	"sqlformys/internal/modulekind"
)

func TestRenameModule(t *testing.T) {
	dir := t.TempDir()
	c := NewContentAdmin()
	rel := "proj/old"
	if err := os.MkdirAll(filepath.Join(dir, "proj"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "proj", "old.sql"), []byte("--"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := c.RenameModule(dir, rel, "proj/new", modulekind.KindSQL); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "proj", "new.sql")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "proj", "old.sql")); !os.IsNotExist(err) {
		t.Fatal("old file should be gone")
	}
}