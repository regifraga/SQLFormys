package admin

import (
	"os"
	"strings"
	"sync"

	"sqlformys/internal/auth"
	"sqlformys/internal/fsutil"
)

// Registry stores administrator usernames in a plain-text file (one per line).
type Registry struct {
	path string
	seed []string
	mu   sync.Mutex
}

func NewRegistry(path string, seed []string) *Registry {
	return &Registry{
		path: strings.TrimSpace(path),
		seed: append([]string(nil), seed...),
	}
}

func (r *Registry) Path() string {
	if r == nil {
		return ""
	}
	return r.path
}

// Bootstrap creates the file from seed when missing.
func (r *Registry) Bootstrap() error {
	if r == nil || r.path == "" {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, err := os.Stat(r.path); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	return r.writeLinesLocked(normalizeUserList(r.seed))
}

func (r *Registry) IsAdmin(username string) bool {
	if r == nil || r.path == "" {
		return false
	}
	key := auth.NormalizeLogin(username)
	users, err := r.List()
	if err != nil {
		return false
	}
	for _, u := range users {
		if auth.NormalizeLogin(u) == key {
			return true
		}
	}
	return false
}

func (r *Registry) List() ([]string, error) {
	if r == nil || r.path == "" {
		return []string{}, nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.readLinesLocked()
}

func (r *Registry) SetAdmin(username string, admin bool) error {
	if r == nil || r.path == "" {
		return nil
	}
	username = strings.TrimSpace(username)
	if username == "" {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	lines, err := r.readLinesLocked()
	if err != nil {
		return err
	}
	key := auth.NormalizeLogin(username)
	out := make([]string, 0, len(lines))
	found := false
	for _, line := range lines {
		if auth.NormalizeLogin(line) == key {
			found = true
			if !admin {
				continue
			}
			out = append(out, username)
			continue
		}
		out = append(out, line)
	}
	if admin && !found {
		out = append(out, username)
	}
	return r.writeLinesLocked(normalizeUserList(out))
}

func (r *Registry) Rename(oldName, newName string) error {
	if r == nil || r.path == "" {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	lines, err := r.readLinesLocked()
	if err != nil {
		return err
	}
	oldKey := auth.NormalizeLogin(oldName)
	for i, line := range lines {
		if auth.NormalizeLogin(line) == oldKey {
			lines[i] = strings.TrimSpace(newName)
			return r.writeLinesLocked(normalizeUserList(lines))
		}
	}
	return nil
}

func (r *Registry) Remove(username string) error {
	return r.SetAdmin(username, false)
}

func normalizeUserList(users []string) []string {
	seen := map[string]string{}
	var out []string
	for _, u := range users {
		u = strings.TrimSpace(u)
		if u == "" {
			continue
		}
		key := auth.NormalizeLogin(u)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = u
		out = append(out, u)
	}
	return out
}

func (r *Registry) readLinesLocked() ([]string, error) {
	data, err := os.ReadFile(r.path)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}

	var lines []string
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		lines = append(lines, line)
	}
	return lines, nil
}

func (r *Registry) writeLinesLocked(users []string) error {
	var b strings.Builder
	for i, u := range users {
		if i > 0 {
			b.WriteByte('\n')
		}
		b.WriteString(u)
	}
	if len(users) > 0 {
		b.WriteByte('\n')
	}
	return fsutil.WriteFileReplace(r.path, []byte(b.String()), 0o600)
}
