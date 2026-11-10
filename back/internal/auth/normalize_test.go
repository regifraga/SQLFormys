package auth

import "testing"

func TestNormalizeLogin(t *testing.T) {
	if NormalizeLogin(`EMPRESA\Regi`) != NormalizeLogin("regi") {
		t.Fatal("domain user should normalize to short name")
	}
}
