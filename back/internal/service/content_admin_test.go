package service

import (
	"os"
	"path/filepath"
	"testing"

	"sqlformys/internal/modulekind"
)

func TestWriteModuleBasenameConflict(t *testing.T) {
	dir := t.TempDir()
	c := NewContentAdmin()
	rel := "proj/mod"
	if err := os.MkdirAll(filepath.Join(dir, "proj"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "proj", "mod.sql"), []byte("--"), 0o644); err != nil {
		t.Fatal(err)
	}
	err := c.WriteModule(dir, rel, modulekind.KindSH, "#!/bin/bash\necho hi\n")
	if err == nil {
		t.Fatal("expected conflict when creating .sh with existing .sql basename")
	}
}
