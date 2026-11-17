package cache

import "errors"

// ExecError preserves generated SQL/script when a cached query path fails.
type ExecError struct {
	SQL string
	Err error
}

func (e *ExecError) Error() string {
	if e == nil || e.Err == nil {
		return ""
	}
	return e.Err.Error()
}

func (e *ExecError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

// ExecSQLOrEmpty returns SQL attached to an ExecError, if any.
func ExecSQLOrEmpty(err error) string {
	var execErr *ExecError
	if errors.As(err, &execErr) && execErr != nil {
		return execErr.SQL
	}
	return ""
}