package engine

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseMetadataModuleCache(t *testing.T) {
	p, err := ParseMetadataForKind("--CACHE=15s\n--<PROPERTIES>\n--</PROPERTIES>", "sql")
	require.NoError(t, err)
	assert.Equal(t, 15*time.Second, p.CacheTTL)
}

func TestParseMetadataLookupBlockCache(t *testing.T) {
	sql := `--<LOOKUP Usuarios 1m>
SELECT 1 AS Code, 2 AS Value
--</LOOKUP>
--<LOOKUP Empresas CACHE=2h>
SELECT 1
--</LOOKUP>`
	p, err := ParseMetadata(sql)
	require.NoError(t, err)
	assert.Equal(t, time.Minute, p.LookupCacheTTL["Usuarios"])
	assert.Equal(t, 2*time.Hour, p.LookupCacheTTL["Empresas"])
}

func TestParseMetadataInvalidCache(t *testing.T) {
	_, err := ParseMetadata("--CACHE=bad\n--<PROPERTIES>\n--</PROPERTIES>")
	assert.Error(t, err)
}