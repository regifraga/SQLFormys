package usersettings

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"sqlformys/internal/auth"
	"sqlformys/internal/fsutil"
)

// ErrNotConfigured is returned when USER_SETTINGS_PATH is empty.
var ErrNotConfigured = errors.New("user settings path não configurado")

// Settings holds per-user UI preferences persisted as JSON.
type Settings struct {
	Favorites       []string `json:"favorites,omitempty"`
	Theme           string   `json:"theme,omitempty"`
	SidebarExpanded []string `json:"sidebarExpanded,omitempty"`
	SidebarWidth    int      `json:"sidebarWidth,omitempty"`
}

// Store reads and writes user settings files under baseDir.
type Store struct {
	baseDir string
}

func NewStore(baseDir string) *Store {
	return &Store{baseDir: strings.TrimSpace(baseDir)}
}

func (s *Store) Available() bool {
	return s != nil && s.baseDir != ""
}

// SanitizeFileStem produces a safe filename stem from a login name.
func SanitizeFileStem(username string) string {
	base := auth.NormalizeLogin(username)
	if base == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(base))
	for _, r := range base {
		switch {
		case unicode.IsLetter(r), unicode.IsDigit(r):
			b.WriteRune(r)
		case r == '@', r == '.', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteRune('_')
		}
	}
	out := strings.Trim(b.String(), "._-")
	if out == "" {
		return "user"
	}
	return out
}

func (s *Store) filePath(username string) (string, error) {
	if !s.Available() {
		return "", ErrNotConfigured
	}
	stem := SanitizeFileStem(username)
	if stem == "" {
		return "", errors.New("nome de usuário inválido")
	}
	return filepath.Join(s.baseDir, stem+".json"), nil
}

func emptySettingsJSON() []byte {
	return []byte("{}\n")
}

// Ensure creates an empty settings file if missing.
func (s *Store) Ensure(username string) error {
	path, err := s.filePath(username)
	if err != nil {
		return err
	}
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	return fsutil.WriteFileReplace(path, emptySettingsJSON(), 0o600)
}

// Get loads settings for username, creating the file on first access if missing.
func (s *Store) Get(username string) (Settings, error) {
	var zero Settings
	path, err := s.filePath(username)
	if err != nil {
		return zero, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			if err := s.Ensure(username); err != nil {
				return zero, err
			}
			return zero, nil
		}
		return zero, err
	}
	data = trimBOM(data)
	if len(data) == 0 {
		return zero, nil
	}
	var out Settings
	if err := json.Unmarshal(data, &out); err != nil {
		return zero, err
	}
	if out.Favorites == nil {
		out.Favorites = []string{}
	}
	if out.SidebarExpanded == nil {
		out.SidebarExpanded = []string{}
	}
	return out, nil
}

// Put replaces the stored document with the given settings.
func (s *Store) Put(username string, settings Settings) error {
	path, err := s.filePath(username)
	if err != nil {
		return err
	}
	if settings.Favorites == nil {
		settings.Favorites = []string{}
	}
	if settings.SidebarExpanded == nil {
		settings.SidebarExpanded = []string{}
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return fsutil.WriteFileReplace(path, data, 0o600)
}

// Patch merges partial settings into the stored document.
func (s *Store) Patch(username string, partial Settings, patchFavorites, patchTheme, patchSidebar, patchSidebarWidth bool) (Settings, error) {
	current, err := s.Get(username)
	if err != nil {
		return Settings{}, err
	}
	if patchFavorites {
		current.Favorites = partial.Favorites
		if current.Favorites == nil {
			current.Favorites = []string{}
		}
	}
	if patchTheme {
		current.Theme = partial.Theme
	}
	if patchSidebar {
		current.SidebarExpanded = partial.SidebarExpanded
		if current.SidebarExpanded == nil {
			current.SidebarExpanded = []string{}
		}
	}
	if patchSidebarWidth {
		current.SidebarWidth = partial.SidebarWidth
	}
	if err := s.Put(username, current); err != nil {
		return Settings{}, err
	}
	return current, nil
}

// Rename moves settings from oldName to newName when the source file exists.
func (s *Store) Rename(oldName, newName string) error {
	oldPath, err := s.filePath(oldName)
	if err != nil {
		return err
	}
	newPath, err := s.filePath(newName)
	if err != nil {
		return err
	}
	if oldPath == newPath {
		return nil
	}
	if _, err := os.Stat(oldPath); os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(newPath), 0o700); err != nil {
		return err
	}
	if _, err := os.Stat(newPath); err == nil {
		_ = os.Remove(newPath)
	} else if !os.IsNotExist(err) {
		return err
	}
	return os.Rename(oldPath, newPath)
}

// Delete removes the settings file for username if present.
func (s *Store) Delete(username string) error {
	path, err := s.filePath(username)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func trimBOM(data []byte) []byte {
	if len(data) >= 3 && data[0] == 0xEF && data[1] == 0xBB && data[2] == 0xBF {
		return data[3:]
	}
	return data
}
