package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"sqlformys/internal/modulekind"
)

func TestParseMetadataForKind_Shell(t *testing.T) {
	content := `#DESCRIPTION=Teste shell
#RESULT_TYPE=TEXT
#TIMEOUT=30

#<PROPERTIES>
# @?#NM_ARQUIVO:VARCHAR:50:=:Nome
#</PROPERTIES>
`
	parser, err := ParseMetadataForKind(content, modulekind.KindSH)
	assert.NoError(t, err)
	assert.Equal(t, "Teste shell", parser.Description)
	assert.Equal(t, "TEXT", parser.ResultType)
	assert.Equal(t, 30, parser.Timeout)
	assert.Equal(t, "", parser.Server)
	assert.Len(t, parser.Fields, 1)
	assert.Equal(t, "NM_ARQUIVO", parser.Fields[0].Field)
}

func TestParseMetadataForKind_ShellRejectsLookup(t *testing.T) {
	content := `#<LOOKUP X>
SELECT 1
#</LOOKUP>
`
	_, err := ParseMetadataForKind(content, modulekind.KindSH)
	assert.Error(t, err)
}
