package htpasswd

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStoreCreateVerifyAndChange(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "htpasswd")
	store := NewStore(path)

	if err := store.CreateUser("alice", "Str0ng!pass"); err != nil {
		t.Fatal(err)
	}
	ok, err := store.VerifyPassword("alice", "Str0ng!pass")
	if err != nil || !ok {
		t.Fatalf("verify: ok=%v err=%v", ok, err)
	}
	if err := store.SetPassword("alice", "NewStr0ng!pass"); err != nil {
		t.Fatal(err)
	}
	ok, err = store.VerifyPassword("alice", "NewStr0ng!pass")
	if err != nil || !ok {
		t.Fatalf("after change: ok=%v err=%v", ok, err)
	}
	data, _ := os.ReadFile(path)
	if string(data) == "" {
		t.Fatal("file empty")
	}
}
