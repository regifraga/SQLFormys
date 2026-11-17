package library

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIsLibraryRelPath_InheritsSubfolder(t *testing.T) {
	base := t.TempDir()
	lib := filepath.Join(base, "Bibliotecas")
	if err := os.MkdirAll(filepath.Join(lib, "Financeiro"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(lib, MarkerFileName), []byte{}, 0o644); err != nil {
		t.Fatal(err)
	}
	if !IsLibraryRelPath(base, "Bibliotecas") {
		t.Fatal("expected Bibliotecas to be library")
	}
	if !IsLibraryRelPath(base, "Bibliotecas/Financeiro") {
		t.Fatal("expected subfolder to inherit library")
	}
	if !IsLibraryModule(base, "Bibliotecas/Financeiro/fragmento") {
		t.Fatal("expected module in subfolder to be library module")
	}
}