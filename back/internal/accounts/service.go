package accounts

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"sqlformys/internal/admin"
	"sqlformys/internal/auth"
	"sqlformys/internal/config"
	"sqlformys/internal/htpasswd"
	"sqlformys/internal/security"
	"sqlformys/internal/usersettings"
)

// UserView is returned to API consumers.
type UserView struct {
	Username string `json:"username"`
	Admin    bool   `json:"admin"`
}

// Service coordinates htpasswd and administrator registry.
type Service struct {
	ht   *htpasswd.Store
	adm  *admin.Registry
	cfg  *config.Config
	user *usersettings.Store
}

func NewService(cfg *config.Config) (*Service, error) {
	htPath := strings.TrimSpace(cfg.HtpasswdPath)
	adminPath := strings.TrimSpace(cfg.AdministratorsFile)
	if adminPath == "" && htPath != "" {
		adminPath = filepath.Join(filepath.Dir(htPath), "administrators")
	}

	svc := &Service{
		ht:   htpasswd.NewStore(htPath),
		adm:  admin.NewRegistry(adminPath, cfg.AdministratorsSeed),
		cfg:  cfg,
		user: usersettings.NewStore(cfg.UserSettingsPath),
	}

	if err := svc.adm.Bootstrap(); err != nil {
		return nil, fmt.Errorf("administrators: %w", err)
	}
	return svc, nil
}

func (s *Service) CanChangePassword() bool {
	return s != nil && s.ht != nil && s.ht.Available()
}

func (s *Service) UserSettings() *usersettings.Store {
	if s == nil {
		return nil
	}
	return s.user
}

func (s *Service) IsAdmin(username string) bool {
	if s == nil || s.adm == nil {
		return false
	}
	return s.adm.IsAdmin(username)
}

func (s *Service) ListUsers() ([]UserView, error) {
	if s == nil || s.ht == nil || s.ht.Path() == "" {
		return nil, htpasswd.ErrNotConfigured
	}
	names, err := s.ht.ListUsers()
	if err != nil {
		return nil, err
	}
	out := make([]UserView, 0, len(names))
	for _, name := range names {
		out = append(out, UserView{
			Username: name,
			Admin:    s.adm.IsAdmin(name),
		})
	}
	return out, nil
}

func (s *Service) ChangeOwnPassword(username, currentPassword, newPassword string) error {
	if !s.CanChangePassword() {
		return htpasswd.ErrNotConfigured
	}
	if err := security.ValidateStrongPassword(username, newPassword); err != nil {
		return err
	}
	ok, err := s.ht.VerifyPassword(username, currentPassword)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("senha atual incorreta")
	}
	return s.ht.SetPassword(username, newPassword)
}

func (s *Service) CreateUser(username, password string, asAdmin bool) error {
	if s.ht == nil || s.ht.Path() == "" {
		return htpasswd.ErrNotConfigured
	}
	username = strings.TrimSpace(username)
	if username == "" {
		return fmt.Errorf("nome de usuário inválido")
	}
	if err := security.ValidateStrongPassword(username, password); err != nil {
		return err
	}
	if err := s.ht.CreateUser(username, password); err != nil {
		return err
	}
	if asAdmin {
		if err := s.adm.SetAdmin(username, true); err != nil {
			return err
		}
	}
	if s.user != nil && s.user.Available() {
		return s.user.Ensure(username)
	}
	return nil
}

func (s *Service) UpdateUser(oldName, newName, newPassword string, asAdmin *bool) error {
	if s.ht == nil || s.ht.Path() == "" {
		return htpasswd.ErrNotConfigured
	}
	oldName = strings.TrimSpace(oldName)
	newName = strings.TrimSpace(newName)
	if oldName == "" {
		return fmt.Errorf("nome de usuário inválido")
	}
	if newName == "" {
		newName = oldName
	}
	if newName != oldName {
		if err := s.ht.RenameUser(oldName, newName); err != nil {
			return err
		}
		if err := s.adm.Rename(oldName, newName); err != nil {
			return err
		}
		if s.user != nil && s.user.Available() {
			if err := s.user.Rename(oldName, newName); err != nil {
				return err
			}
		}
		oldName = newName
	}
	if newPassword != "" {
		if err := security.ValidateStrongPassword(newName, newPassword); err != nil {
			return err
		}
		if err := s.ht.SetPassword(newName, newPassword); err != nil {
			return err
		}
	}
	if asAdmin != nil {
		return s.adm.SetAdmin(newName, *asAdmin)
	}
	return nil
}

func (s *Service) DeleteUser(username, actor string) error {
	if s.ht == nil || s.ht.Path() == "" {
		return htpasswd.ErrNotConfigured
	}
	if auth.NormalizeLogin(username) == auth.NormalizeLogin(actor) {
		return errors.New("não é permitido excluir o próprio usuário")
	}
	if s.adm.IsAdmin(username) {
		admins, _ := s.adm.List()
		if len(admins) <= 1 {
			return errors.New("não é permitido remover o último administrador")
		}
	}
	if err := s.ht.DeleteUser(username); err != nil {
		return err
	}
	if err := s.adm.Remove(username); err != nil {
		return err
	}
	if s.user != nil && s.user.Available() {
		return s.user.Delete(username)
	}
	return nil
}

func (s *Service) EnsureHtpasswdFile() error {
	if s == nil || s.ht == nil || s.ht.Path() == "" {
		return nil
	}
	path := s.ht.Path()
	if _, err := os.Stat(path); err == nil {
		return nil
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return err
	}
	return f.Close()
}
