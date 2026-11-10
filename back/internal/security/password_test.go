package security

import "testing"

func TestValidateStrongPassword(t *testing.T) {
	if err := ValidateStrongPassword("user", "Abcd1234!x"); err != nil {
		t.Fatalf("expected ok: %v", err)
	}
	if err := ValidateStrongPassword("user", "short1!A"); err == nil {
		t.Fatal("expected weak password error")
	}
	if err := ValidateStrongPassword("user", "user"); err == nil {
		t.Fatal("expected username match rejection")
	}
}
