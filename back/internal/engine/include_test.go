package engine

import (
	"os"
	"path/filepath"
	"testing"

	"sqlformys/internal/library"
	"sqlformys/internal/modulekind"
)

func writeModule(t *testing.T, base, rel, kind, content string) {
	t.Helper()
	ext, err := modulekind.ExtForKind(kind)
	if err != nil {
		t.Fatal(err)
	}
	abs := filepath.Join(base, filepath.FromSlash(rel+ext))
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func markLibrary(t *testing.T, base, folderRel string) {
	t.Helper()
	dir := filepath.Join(base, filepath.FromSlash(folderRel))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, library.MarkerFileName), []byte{}, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestExpandIncludes_MergesLibrarySQL(t *testing.T) {
	base := t.TempDir()
	markLibrary(t, base, "Lib")
	writeModule(t, base, "Lib/frag", modulekind.KindSQL, "SELECT 2 AS X;\n")
	host := "--INCLUDE=Lib/frag\nSELECT 1 AS A;\n"
	out, err := ExpandIncludes(base, host, modulekind.KindSQL)
	if err != nil {
		t.Fatal(err)
	}
	if !containsAll(out, "SELECT 2 AS X", "SELECT 1 AS A") {
		t.Fatalf("unexpected output:\n%s", out)
	}
}

func TestExpandIncludes_RejectsNonLibrary(t *testing.T) {
	base := t.TempDir()
	writeModule(t, base, "Pub/frag", modulekind.KindSQL, "SELECT 1;\n")
	host := "--INCLUDE=Pub/frag\n"
	_, err := ExpandIncludes(base, host, modulekind.KindSQL)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestExpandIncludes_DetectsCycle(t *testing.T) {
	base := t.TempDir()
	markLibrary(t, base, "Lib")
	writeModule(t, base, "Lib/a", modulekind.KindSQL, "--INCLUDE=Lib/b\n")
	writeModule(t, base, "Lib/b", modulekind.KindSQL, "--INCLUDE=Lib/a\n")
	_, err := ExpandIncludes(base, "--INCLUDE=Lib/a\n", modulekind.KindSQL)
	if err == nil {
		t.Fatal("expected cycle error")
	}
}

func containsAll(s string, parts ...string) bool {
	for _, p := range parts {
		if !contains(s, p) {
			return false
		}
	}
	return true
}

func contains(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}