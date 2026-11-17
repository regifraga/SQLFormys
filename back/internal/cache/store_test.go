package cache

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"sqlformys/internal/domain"
)

func TestStoreQueryHitMissAndExpiry(t *testing.T) {
	s := NewStore()
	key := "k1"
	ttl := 50 * time.Millisecond
	result := domain.QueryResult{Columns: []string{"a"}, Rows: []map[string]interface{}{{"a": 1}}}

	_, ok := s.GetQuery(key)
	assert.False(t, ok)

	s.SetQuery(key, ttl, result)
	got, ok := s.GetQuery(key)
	require.True(t, ok)
	assert.Equal(t, 1, len(got.Rows))

	time.Sleep(60 * time.Millisecond)
	_, ok = s.GetQuery(key)
	assert.False(t, ok)
}

func TestStoreLRU(t *testing.T) {
	s := NewStore()
	s.maxItems = 2
	r := domain.QueryResult{Rows: []map[string]interface{}{{"x": 1}}}
	s.SetQuery("a", time.Minute, r)
	s.SetQuery("b", time.Minute, r)
	s.SetQuery("c", time.Minute, r)

	_, okA := s.GetQuery("a")
	_, okB := s.GetQuery("b")
	_, okC := s.GetQuery("c")
	assert.False(t, okA)
	assert.True(t, okB)
	assert.True(t, okC)
}

func TestBuildKeyStablePayloadOrder(t *testing.T) {
	k1 := BuildKey(KeyParts{
		QueryPath: "p",
		Payload:   map[string]interface{}{"b": 2, "a": 1},
	})
	k2 := BuildKey(KeyParts{
		QueryPath: "p",
		Payload:   map[string]interface{}{"a": 1, "b": 2},
	})
	assert.Equal(t, k1, k2)
}