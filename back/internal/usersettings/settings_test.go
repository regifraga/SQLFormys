package usersettings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSanitizeFileStem(t *testing.T) {
	t.Parallel()
	tests := []struct {
		in   string
		want string
	}{
		{"DOMAIN\\User", "user"},
		{"user@REALM.COM", "user"},
		{"Admin.User", "admin.user"},
		{"", ""},
	}
	for _, tc := range tests {
		got := SanitizeFileStem(tc.in)
		require.Equal(t, tc.want, got, "input %q", tc.in)
	}
}

func TestStoreRenameDelete(t *testing.T) {
	dir := t.TempDir()
	store := NewStore(dir)
	username := "alice"
	require.NoError(t, store.Ensure(username))
	_, err := store.Patch(username, Settings{
		Favorites:       []string{"a/b"},
		SidebarExpanded: []string{"tree:root"},
	}, true, false, true, false)
	require.NoError(t, err)

	pathAlice := filepath.Join(dir, "alice.json")
	require.FileExists(t, pathAlice)

	require.NoError(t, store.Rename(username, "bob"))
	require.NoFileExists(t, pathAlice)
	require.FileExists(t, filepath.Join(dir, "bob.json"))

	got, err := store.Get("bob")
	require.NoError(t, err)
	require.Equal(t, []string{"a/b"}, got.Favorites)

	require.NoError(t, store.Delete("bob"))
	require.NoFileExists(t, filepath.Join(dir, "bob.json"))
}

func TestStoreGetPutRoundTrip(t *testing.T) {
	dir := t.TempDir()
	store := NewStore(dir)
	s := Settings{
		Favorites:       []string{"p/m.sql"},
		Theme:           "dark",
		SidebarExpanded: []string{"favorites"},
	}
	require.NoError(t, store.Put("carol", s))
	got, err := store.Get("carol")
	require.NoError(t, err)
	require.Equal(t, s.Favorites, got.Favorites)
	require.Equal(t, s.Theme, got.Theme)
	require.Equal(t, s.SidebarExpanded, got.SidebarExpanded)

	path := filepath.Join(dir, "carol.json")
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	var raw map[string]interface{}
	require.NoError(t, json.Unmarshal(data, &raw))
	require.Equal(t, "dark", raw["theme"])
}
