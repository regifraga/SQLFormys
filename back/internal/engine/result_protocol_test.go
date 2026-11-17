package engine

import (
	"testing"

	"sqlformys/internal/domain"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestApplyResultProtocolGrid(t *testing.T) {
	in := domain.QueryResult{
		Columns: []string{"Id", "IC_EXECUTE", "DS_MESSAGE"},
		Rows: []map[string]interface{}{
			{"Id": 1, "IC_EXECUTE": "N", "DS_MESSAGE": "Bloqueado"},
		},
		ResultType: "GRID",
	}
	out := ApplyResultProtocol(in)
	assert.Equal(t, []string{"Id"}, out.Columns)
	require.NotNil(t, out.CanExecute)
	assert.False(t, *out.CanExecute)
	require.Len(t, out.Messages, 1)
	assert.Equal(t, "Bloqueado", out.Messages[0].Message)
}

func TestApplyResultProtocolScriptStdout(t *testing.T) {
	in := domain.QueryResult{
		Columns: []string{"stdout"},
		Rows: []map[string]interface{}{
			{"stdout": "SQLFORMYS_CAN_EXECUTE=N\nSQLFORMYS_MESSAGE=WARNING: Ops\nlinha restante\n"},
		},
		ResultType: "TEXT",
	}
	out := ApplyResultProtocol(in)
	assert.Contains(t, out.Rows[0]["stdout"], "linha restante")
	require.NotNil(t, out.CanExecute)
	assert.False(t, *out.CanExecute)
	require.Len(t, out.Messages, 1)
}

func TestParseCanExecuteBool(t *testing.T) {
	assert.NotNil(t, ParseCanExecuteBool("S"))
	assert.True(t, *ParseCanExecuteBool("S"))
	assert.False(t, *ParseCanExecuteBool("N"))
}