package logging

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRotateBySize(t *testing.T) {
	dir := t.TempDir()
	const fileName = "test.log"

	w, err := newRotatingWriter(dir, fileName, RotationSize, 64, 3)
	if err != nil {
		t.Fatal(err)
	}
	defer w.Close()

	payload := strings.Repeat("x", 80)
	if _, err := w.Write([]byte(payload)); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Write([]byte(payload)); err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(filepath.Join(dir, fileName+".1")); err != nil {
		t.Fatalf("esperava arquivo rotacionado .1: %v", err)
	}
}
