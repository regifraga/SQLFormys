package security

import (
	"errors"
	"fmt"
	"strings"
	"unicode"
)

var (
	ErrPasswordWeak = errors.New("senha não atende aos requisitos mínimos de segurança")
)

var commonPasswords = map[string]struct{}{
	"123456": {}, "12345678": {}, "password": {}, "senha123": {},
	"qwerty": {}, "abc123": {}, "111111": {}, "1234567890": {},
	"sqlformys": {}, "admin": {}, "administrator": {},
}

// ValidateStrongPassword enforces minimum strength rules.
func ValidateStrongPassword(username, password string) error {
	if len(password) < 10 {
		return fmt.Errorf("%w: mínimo 10 caracteres", ErrPasswordWeak)
	}
	userKey := strings.ToLower(strings.TrimSpace(username))
	passKey := strings.ToLower(password)
	if userKey != "" && passKey == userKey {
		return fmt.Errorf("%w: não pode ser igual ao nome de usuário", ErrPasswordWeak)
	}
	if _, banned := commonPasswords[passKey]; banned {
		return fmt.Errorf("%w: senha muito comum", ErrPasswordWeak)
	}

	var hasUpper, hasLower, hasDigit, hasSpecial bool
	for _, r := range password {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsDigit(r):
			hasDigit = true
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			hasSpecial = true
		}
	}
	if !hasUpper || !hasLower || !hasDigit || !hasSpecial {
		return fmt.Errorf("%w: use maiúscula, minúscula, número e caractere especial", ErrPasswordWeak)
	}
	return nil
}
