package filesafe

import (
	"path/filepath"
	"testing"
)

func TestResolveUnderBaseRejectsTraversal(t *testing.T) {
	base := t.TempDir()
	_, err := ResolveUnderBase(base, "../outside")
	if err == nil {
		t.Fatal("expected error for traversal")
	}
	got, err := ResolveUnderBase(base, "proj/modulo")
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(got) != "modulo" {
		t.Fatalf("unexpected %s", got)
	}
}
