package domain

import "context"

// Field represents a dynamic parameter mapped from SQL files
type Field struct {
	Field        string `json:"field"`
	Type         string `json:"type"`
	Label        string `json:"label"`
	Size         int    `json:"size"`
	Required     bool   `json:"required"`
	DefaultValue string `json:"defaultValue"`
	Operator     string `json:"-"` // Internal use for building query, typically '='
}

// QueryProject represents a group of Modules (SQL scripts)
type QueryProject struct {
	Project string   `json:"project"`
	Modules []string `json:"modules"`
}

// MetadataResponse is the return object for the GET metadata endpoint
type MetadataResponse []Field

// QueryResult represents the result of a dynamic query execution, preserving column order.
type QueryResult struct {
	Columns []string                 `json:"columns"`
	Rows    []map[string]interface{} `json:"rows"`
}

// DynamicQueryService defines the business logic for dynamic SQL execution
type DynamicQueryService interface {
	ListProjects(basePath string) ([]QueryProject, error)
	GetMetadata(basePath, project, module string) (MetadataResponse, error)
	ExecuteQuery(ctx context.Context, basePath, project, module string, payload map[string]interface{}, defaultDriver, defaultDsn string) (QueryResult, string, error)
}
