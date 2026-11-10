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
	Information  string `json:"information"`
	DependsOn    []string `json:"dependsOn,omitempty"`
	ContextKey   string   `json:"contextKey,omitempty"`
	Hidden       bool     `json:"hidden,omitempty"`
	Operator     string   `json:"-"` // Internal use for building query, typically '='
	DbType       string   `json:"-"` // Internal use for database type (e.g. for SINGLE)
}

// TreeNode represents a hierarchical node (folder or module) in the queries directory tree
type TreeNode struct {
	Name     string     `json:"name"`
	Type     string     `json:"type"`           // "folder" ou "module"
	Path     string     `json:"path,omitempty"` // Caminho relativo para modules, ex: "Financeiro/Relatorios/fechamento"
	Children []TreeNode `json:"children,omitempty"`
}

// MetadataResponse is the return object for the GET metadata endpoint
type MetadataResponse struct {
	Server      string                    `json:"server"`
	Description string                    `json:"description"`
	ExecuteMode string                    `json:"executeMode"`
	Timeout     int                       `json:"timeout"`
	Fields      []Field                   `json:"fields"`
	Lookups     map[string]LookupMetadata `json:"lookups,omitempty"`
}

// LookupMetadata describes a named lookup block declared in the SQL module.
type LookupMetadata struct {
	DependsOn []string `json:"dependsOn"`
}

// QueryResult represents the result of a dynamic query execution, preserving column order.
type QueryResult struct {
	Columns []string                 `json:"columns"`
	Rows    []map[string]interface{} `json:"rows"`
}

// LookupOption is a dropdown item produced by a named LOOKUP query.
type LookupOption struct {
	Code  interface{} `json:"code"`
	Value interface{} `json:"value"`
}

// LookupResult is the return object for POST /api/lookups/{filepath}
type LookupResult struct {
	Options []LookupOption `json:"options"`
}

// DynamicQueryService defines the business logic for dynamic SQL execution
type DynamicQueryService interface {
	ListProjects(basePath string) ([]TreeNode, error)
	GetMetadata(basePath, queryPath string) (MetadataResponse, error)
	ExecuteQuery(ctx context.Context, basePath, queryPath string, payload map[string]interface{}, defaultDriver, defaultDsn string) (QueryResult, string, error)
	ExecuteLookup(ctx context.Context, basePath, queryPath, lookupName, lookupField string, payload map[string]interface{}, defaultDriver, defaultDsn string) (LookupResult, string, error)
}
