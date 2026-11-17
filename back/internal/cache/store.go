package cache

import (
	"encoding/json"
	"errors"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"sqlformys/internal/domain"
)

const (
	DefaultMaxEntries = 512
	MaxCachedRows     = 10_000
)

type entry struct {
	expiresAt time.Time
	query     *domain.QueryResult
	lookup    *domain.LookupResult
}

// Store is an in-process TTL cache with LRU eviction.
type Store struct {
	mu       sync.Mutex
	entries  map[string]*entry
	order    []string
	maxItems int
	group    singleflight.Group
}

func NewStore() *Store {
	return &Store{
		entries:  make(map[string]*entry),
		maxItems: DefaultMaxEntries,
	}
}

func (s *Store) GetQuery(key string) (*domain.QueryResult, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.entries[key]
	if !ok || time.Now().After(e.expiresAt) {
		if ok {
			delete(s.entries, key)
		}
		return nil, false
	}
	s.touchLocked(key)
	if e.query == nil {
		return nil, false
	}
	cp := cloneQueryResult(*e.query)
	return &cp, true
}

func (s *Store) GetLookup(key string) (*domain.LookupResult, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.entries[key]
	if !ok || time.Now().After(e.expiresAt) {
		if ok {
			delete(s.entries, key)
		}
		return nil, false
	}
	s.touchLocked(key)
	if e.lookup == nil {
		return nil, false
	}
	cp := cloneLookupResult(*e.lookup)
	return &cp, true
}

func (s *Store) SetQuery(key string, ttl time.Duration, result domain.QueryResult) {
	if ttl <= 0 || len(result.Rows) > MaxCachedRows {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	cp := cloneQueryResult(result)
	s.entries[key] = &entry{
		expiresAt: time.Now().Add(ttl),
		query:     &cp,
	}
	s.touchLocked(key)
	s.evictLocked()
}

func (s *Store) SetLookup(key string, ttl time.Duration, result domain.LookupResult) {
	if ttl <= 0 || len(result.Options) > MaxCachedRows {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	cp := cloneLookupResult(result)
	s.entries[key] = &entry{
		expiresAt: time.Now().Add(ttl),
		lookup:    &cp,
	}
	s.touchLocked(key)
	s.evictLocked()
}

func (s *Store) DoQuery(key string, ttl time.Duration, fn func() (domain.QueryResult, string, error)) (domain.QueryResult, string, Status, error) {
	if ttl <= 0 {
		result, sql, err := fn()
		return result, sql, StatusBypass, err
	}
	if hit, ok := s.GetQuery(key); ok {
		return *hit, "", StatusHit, nil
	}
	v, err, _ := s.group.Do(key, func() (interface{}, error) {
		if hit, ok := s.GetQuery(key); ok {
			return queryFlight{result: *hit, sql: "", status: StatusHit}, nil
		}
		result, sql, runErr := fn()
		if runErr != nil {
			return nil, &ExecError{SQL: sql, Err: runErr}
		}
		s.SetQuery(key, ttl, result)
		return queryFlight{result: result, sql: sql, status: StatusMiss}, nil
	})
	if err != nil {
		var execErr *ExecError
		if errors.As(err, &execErr) && execErr != nil {
			return domain.QueryResult{}, execErr.SQL, StatusBypass, execErr.Err
		}
		return domain.QueryResult{}, "", StatusBypass, err
	}
	qf := v.(queryFlight)
	return qf.result, qf.sql, qf.status, nil
}

func (s *Store) DoLookup(key string, ttl time.Duration, fn func() (domain.LookupResult, string, error)) (domain.LookupResult, string, Status, error) {
	if ttl <= 0 {
		result, sql, err := fn()
		return result, sql, StatusBypass, err
	}
	if hit, ok := s.GetLookup(key); ok {
		return *hit, "", StatusHit, nil
	}
	v, err, _ := s.group.Do(key, func() (interface{}, error) {
		if hit, ok := s.GetLookup(key); ok {
			return lookupFlight{result: *hit, sql: "", status: StatusHit}, nil
		}
		result, sql, runErr := fn()
		if runErr != nil {
			return nil, &ExecError{SQL: sql, Err: runErr}
		}
		s.SetLookup(key, ttl, result)
		return lookupFlight{result: result, sql: sql, status: StatusMiss}, nil
	})
	if err != nil {
		var execErr *ExecError
		if errors.As(err, &execErr) && execErr != nil {
			return domain.LookupResult{}, execErr.SQL, StatusBypass, execErr.Err
		}
		return domain.LookupResult{}, "", StatusBypass, err
	}
	lf := v.(lookupFlight)
	return lf.result, lf.sql, lf.status, nil
}

type queryFlight struct {
	result domain.QueryResult
	sql    string
	status Status
}

type lookupFlight struct {
	result domain.LookupResult
	sql    string
	status Status
}

func (s *Store) touchLocked(key string) {
	for i, k := range s.order {
		if k == key {
			s.order = append(s.order[:i], s.order[i+1:]...)
			break
		}
	}
	s.order = append(s.order, key)
}

func (s *Store) evictLocked() {
	for len(s.order) > s.maxItems {
		oldest := s.order[0]
		s.order = s.order[1:]
		delete(s.entries, oldest)
	}
}

func cloneQueryResult(r domain.QueryResult) domain.QueryResult {
	out := domain.QueryResult{
		Columns:    append([]string(nil), r.Columns...),
		ResultType: r.ResultType,
		Messages:   append([]domain.UserMessage(nil), r.Messages...),
		CanExecute: r.CanExecute,
	}
	if len(r.Rows) == 0 {
		return out
	}
	out.Rows = make([]map[string]interface{}, len(r.Rows))
	for i, row := range r.Rows {
		dup := make(map[string]interface{}, len(row))
		for k, v := range row {
			dup[k] = v
		}
		out.Rows[i] = dup
	}
	return out
}

func cloneLookupResult(r domain.LookupResult) domain.LookupResult {
	out := domain.LookupResult{Options: make([]domain.LookupOption, len(r.Options))}
	copy(out.Options, r.Options)
	return out
}

// MarshalQueryForDebug encodes a query result (for tests).
func MarshalQueryForDebug(r domain.QueryResult) string {
	b, _ := json.Marshal(r)
	return string(b)
}