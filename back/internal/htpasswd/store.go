package htpasswd

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"

	gohthttpasswd "github.com/tg123/go-htpasswd"
	"golang.org/x/crypto/bcrypt"

	"sqlformys/internal/fsutil"
)

var (
	ErrNotConfigured = errors.New("htpasswd não configurado")
	ErrUserNotFound  = errors.New("usuário não encontrado")
	ErrUserExists    = errors.New("usuário já existe")
)

// Store reads and updates an Apache htpasswd file.
type Store struct {
	path string
	mu   sync.Mutex
}

func NewStore(path string) *Store {
	return &Store{path: strings.TrimSpace(path)}
}

func (s *Store) Path() string {
	if s == nil {
		return ""
	}
	return s.path
}

func (s *Store) Available() bool {
	if s == nil || s.path == "" {
		return false
	}
	info, err := os.Stat(s.path)
	return err == nil && !info.IsDir()
}

func (s *Store) ListUsers() ([]string, error) {
	if s == nil || s.path == "" {
		return nil, ErrNotConfigured
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.listUsersLocked()
}

func (s *Store) listUsersLocked() ([]string, error) {
	f, err := os.Open(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}
	defer f.Close()

	var users []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		user, _, ok := strings.Cut(line, ":")
		user = strings.TrimSpace(user)
		if ok && user != "" {
			users = append(users, user)
		}
	}
	return users, scanner.Err()
}

func (s *Store) VerifyPassword(username, password string) (bool, error) {
	if s == nil || s.path == "" {
		return false, ErrNotConfigured
	}
	auth, err := gohthttpasswd.New(s.path, gohthttpasswd.DefaultSystems, nil)
	if err != nil {
		return false, err
	}
	return auth.Match(username, password), nil
}

func (s *Store) SetPassword(username, password string) error {
	if s == nil || s.path == "" {
		return ErrNotConfigured
	}
	username = strings.TrimSpace(username)
	if username == "" {
		return fmt.Errorf("nome de usuário inválido")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	hashStr := strings.Replace(string(hash), "$2a$", "$2y$", 1)

	s.mu.Lock()
	defer s.mu.Unlock()

	lines, err := s.readLinesLocked()
	if err != nil {
		return err
	}

	found := false
	prefix := username + ":"
	for i, line := range lines {
		user, _, ok := strings.Cut(line, ":")
		if ok && strings.EqualFold(strings.TrimSpace(user), username) {
			lines[i] = prefix + hashStr
			found = true
			break
		}
	}
	if !found {
		lines = append(lines, prefix+hashStr)
	}
	return s.writeLinesLocked(lines)
}

func (s *Store) CreateUser(username, password string) error {
	if s == nil || s.path == "" {
		return ErrNotConfigured
	}
	username = strings.TrimSpace(username)
	if username == "" {
		return fmt.Errorf("nome de usuário inválido")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	users, err := s.listUsersLocked()
	if err != nil {
		return err
	}
	for _, u := range users {
		if strings.EqualFold(u, username) {
			return ErrUserExists
		}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	hashStr := strings.Replace(string(hash), "$2a$", "$2y$", 1)

	lines, err := s.readLinesLocked()
	if err != nil {
		return err
	}
	lines = append(lines, fmt.Sprintf("%s:%s", username, hashStr))
	return s.writeLinesLocked(lines)
}

func (s *Store) DeleteUser(username string) error {
	if s == nil || s.path == "" {
		return ErrNotConfigured
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	lines, err := s.readLinesLocked()
	if err != nil {
		return err
	}
	out := make([]string, 0, len(lines))
	removed := false
	for _, line := range lines {
		user, _, ok := strings.Cut(line, ":")
		if ok && strings.EqualFold(strings.TrimSpace(user), username) {
			removed = true
			continue
		}
		out = append(out, line)
	}
	if !removed {
		return ErrUserNotFound
	}
	return s.writeLinesLocked(out)
}

func (s *Store) RenameUser(oldName, newName string) error {
	if s == nil || s.path == "" {
		return ErrNotConfigured
	}
	oldName = strings.TrimSpace(oldName)
	newName = strings.TrimSpace(newName)
	if oldName == "" || newName == "" {
		return fmt.Errorf("nome de usuário inválido")
	}
	if strings.EqualFold(oldName, newName) {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	users, err := s.listUsersLocked()
	if err != nil {
		return err
	}
	for _, u := range users {
		if strings.EqualFold(u, newName) {
			return ErrUserExists
		}
	}

	lines, err := s.readLinesLocked()
	if err != nil {
		return err
	}
	updated := false
	for i, line := range lines {
		user, rest, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(user), oldName) {
			lines[i] = newName + ":" + rest
			updated = true
			break
		}
	}
	if !updated {
		return ErrUserNotFound
	}
	return s.writeLinesLocked(lines)
}

func (s *Store) readLinesLocked() ([]string, error) {
	f, err := os.Open(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}
	defer f.Close()

	var lines []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		lines = append(lines, line)
	}
	return lines, scanner.Err()
}

func (s *Store) writeLinesLocked(lines []string) error {
	var b strings.Builder
	for i, line := range lines {
		if i > 0 {
			b.WriteByte('\n')
		}
		b.WriteString(line)
	}
	if len(lines) > 0 {
		b.WriteByte('\n')
	}
	return fsutil.WriteFileReplace(s.path, []byte(b.String()), 0o600)
}
