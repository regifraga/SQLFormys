package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestInterpolate(t *testing.T) {
	known := []string{"NM_ARQUIVO", "IC_TAMANHO2", "DT_INICIAL"}
	values := map[string]string{
		"NM_ARQUIVO": "test.sql",
		"IC_TAMANHO2": "S",
	}

	t.Run("simple token", func(t *testing.T) {
		got := Interpolate("arquivo {{NM_ARQUIVO}}", values, known)
		assert.Equal(t, "arquivo test.sql", got)
	})

	t.Run("spaces inside braces", func(t *testing.T) {
		got := Interpolate("arquivo {{ NM_ARQUIVO }}", values, known)
		assert.Equal(t, "arquivo test.sql", got)
	})

	t.Run("empty value", func(t *testing.T) {
		got := Interpolate("prefix{{DT_INICIAL}}suffix", map[string]string{"DT_INICIAL": ""}, known)
		assert.Equal(t, "prefixsuffix", got)
	})

	t.Run("unknown field kept literal", func(t *testing.T) {
		got := Interpolate("{{CAMPO_INEXISTENTE}}", values, known)
		assert.Equal(t, "{{CAMPO_INEXISTENTE}}", got)
	})

	t.Run("multiple tokens", func(t *testing.T) {
		got := Interpolate("{{NM_ARQUIVO}} e {{IC_TAMANHO2}}", values, known)
		assert.Equal(t, "test.sql e S", got)
	})

	t.Run("no placeholders", func(t *testing.T) {
		got := Interpolate("texto simples", values, known)
		assert.Equal(t, "texto simples", got)
	})

	t.Run("empty text", func(t *testing.T) {
		assert.Equal(t, "", Interpolate("", values, known))
	})

	t.Run("help line example", func(t *testing.T) {
		got := Interpolate("Incluir tamanho do arquivo {{NM_ARQUIVO}}", values, known)
		assert.Equal(t, "Incluir tamanho do arquivo test.sql", got)
	})
}