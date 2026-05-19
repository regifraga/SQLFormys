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

// TreeNode represents a hierarchical node (folder or module) in the queries directory tree
type TreeNode struct {
	Name     string     `json:"name"`
	Type     string     `json:"type"`           // "folder" ou "module"
	Path     string     `json:"path,omitempty"` // Caminho relativo para modules, ex: "Financeiro/Relatorios/fechamento"
	Children []TreeNode `json:"children,omitempty"`
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
	ListProjects(basePath string) ([]TreeNode, error)
	GetMetadata(basePath, queryPath string) (MetadataResponse, error)
	ExecuteQuery(ctx context.Context, basePath, queryPath string, payload map[string]interface{}, defaultDriver, defaultDsn string) (QueryResult, string, error)
}
