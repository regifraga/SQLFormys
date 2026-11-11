package modulekind

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveModule(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "demo.sql"), []byte("--"), 0o644); err != nil {
		t.Fatal(err)
	}

	abs, kind, err := ResolveModule(dir, "demo", KindSQL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if kind != KindSQL || !filepath.IsAbs(abs) {
		t.Fatalf("got %q %q", abs, kind)
	}

	_, _, err = ResolveModule(dir, "missing", "")
	if err == nil {
		t.Fatal("expected not found")
	}
}

func TestBuildTreeBasenameDedup(t *testing.T) {
	dir := t.TempDir()
	sub := filepath.Join(dir, "proj")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sub, "x.sql"), []byte("--"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sub, "x.sh"), []byte("#"), 0o644); err != nil {
		t.Fatal(err)
	}
	if !BasenameConflict(dir, "proj/x") {
		t.Fatal("expected basename conflict")
	}
}
