package engine

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseCacheDuration(t *testing.T) {
	t.Run("valid", func(t *testing.T) {
		d, err := ParseCacheDuration("15s")
		require.NoError(t, err)
		assert.Equal(t, 15*time.Second, d)

		d, err = ParseCacheDuration("1m")
		require.NoError(t, err)
		assert.Equal(t, time.Minute, d)

		d, err = ParseCacheDuration("2h")
		require.NoError(t, err)
		assert.Equal(t, 2*time.Hour, d)
	})

	t.Run("invalid", func(t *testing.T) {
		for _, raw := range []string{"", "15", "1m30s", "500ms", "0s", "25h"} {
			_, err := ParseCacheDuration(raw)
			assert.Error(t, err, raw)
		}
	})
}

func TestParseCacheArg(t *testing.T) {
	d, err := ParseCacheArg("CACHE=1m")
	require.NoError(t, err)
	assert.Equal(t, time.Minute, d)

	d, err = ParseCacheArg("30s")
	require.NoError(t, err)
	assert.Equal(t, 30*time.Second, d)

	_, err = ParseCacheArg("CACHE=30s>")
	assert.Error(t, err)
}

func TestFormatCacheDuration(t *testing.T) {
	assert.Equal(t, "15s", FormatCacheDuration(15*time.Second))
	assert.Equal(t, "1m", FormatCacheDuration(time.Minute))
	assert.Equal(t, "2h", FormatCacheDuration(2*time.Hour))
}