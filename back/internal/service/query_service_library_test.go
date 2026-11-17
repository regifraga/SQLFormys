package service

import (
	"os"
	"path/filepath"
	"testing"

	"sqlformys/internal/library"
)

func TestListProjects_OmitsLibrariesForNonAdmin(t *testing.T) {
	base := t.TempDir()
	if err := os.MkdirAll(filepath.Join(base, "Public"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(base, "Public", "mod.sql"), []byte("--DESCRIPTION=x\nSELECT 1;"), 0o644); err != nil {
		t.Fatal(err)
	}
	lib := filepath.Join(base, "Bibliotecas")
	if err := os.MkdirAll(lib, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(lib, library.MarkerFileName), []byte{}, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(lib, "frag.sql"), []byte("SELECT 1;"), 0o644); err != nil {
		t.Fatal(err)
	}

	svc := &queryService{}
	hidden, err := svc.ListProjects(base, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(hidden) != 1 || hidden[0].Name != "Public" {
		t.Fatalf("expected only Public, got %+v", hidden)
	}

	shown, err := svc.ListProjects(base, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(shown) != 2 {
		t.Fatalf("expected Public + Bibliotecas, got %d", len(shown))
	}
	var libNode bool
	for _, n := range shown {
		if n.Name == "Bibliotecas" {
			libNode = n.Library
		}
	}
	if !libNode {
		t.Fatal("Bibliotecas node should have library=true")
	}
}