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
	StepID       string `json:"stepId,omitempty"`
	DependsOn    []string `json:"dependsOn,omitempty"`
	ContextKey   string   `json:"contextKey,omitempty"`
	Hidden       bool     `json:"hidden,omitempty"`
	Cache        string   `json:"cache,omitempty"` // inline LOOKUP TTL (ex. 30s)
	Operator     string   `json:"-"` // Internal use for building query, typically '='
	DbType       string   `json:"-"` // Internal use for database type (e.g. for SINGLE)
	LookupCacheTTL int64  `json:"-"` // nanoseconds; inline LOOKUP cache override
}

// WizardStepMeta describes one step in a guided wizard module.
type WizardStepMeta struct {
	ID         string   `json:"id"`
	Label      string   `json:"label"`
	HasQuery   bool     `json:"hasQuery"`
	ResultType string   `json:"resultType,omitempty"`
	FieldNames []string `json:"fieldNames"`
}

// WizardSummaryMeta enables an optional final review screen before execute.
type WizardSummaryMeta struct {
	Label             string   `json:"label"`
	FieldNames        []string `json:"fieldNames,omitempty"`
	QueryName         string   `json:"queryName,omitempty"`
	ValidateQueryName string   `json:"validateQueryName,omitempty"`
}

// UserMessage is a static or runtime message shown in the CONFIRM-style modal.
type UserMessage struct {
	When              string `json:"when"` // load, enter, exit, finish, runtime
	StepID            string `json:"stepId,omitempty"`
	Type              string `json:"type"`
	Message           string `json:"message"`
	ValidateQueryName string `json:"validateQueryName,omitempty"`
}

// WizardMetadata is returned when a module defines STEP/WIZARD blocks.
type WizardMetadata struct {
	Steps   []WizardStepMeta     `json:"steps"`
	Summary *WizardSummaryMeta   `json:"summary,omitempty"`
}

// TreeNode represents a hierarchical node (folder or module) in the queries directory tree
type TreeNode struct {
	Name     string     `json:"name"`
	Type     string     `json:"type"`              // "folder" ou "module"
	Kind     string     `json:"kind,omitempty"`    // sql, sh, ps1 — apenas para modules
	Path     string     `json:"path,omitempty"`    // Caminho relativo para modules, ex: "Financeiro/Relatorios/fechamento"
	Library  bool       `json:"library,omitempty"` // pasta Biblioteca (fragmentos INCLUDE)
	Children []TreeNode `json:"children,omitempty"`
}

// ConfirmMetadata signals the UI to ask for confirmation before execute.
type ConfirmMetadata struct {
	Type    string `json:"type"`
	Message string `json:"message,omitempty"`
}

// MetadataResponse is the return object for the GET metadata endpoint
type MetadataResponse struct {
	Kind        string                    `json:"kind"`
	Server      string                    `json:"server"`
	Description string                    `json:"description"`
	ExecuteMode string                    `json:"executeMode"`
	ResultType  string                    `json:"resultType"`
	Timeout     int                       `json:"timeout"`
	Cache       string                    `json:"cache,omitempty"` // module --CACHE (ex. 15s)
	Confirm     *ConfirmMetadata          `json:"confirm,omitempty"`
	Messages    []UserMessage             `json:"messages,omitempty"`
	Fields      []Field                   `json:"fields"`
	Lookups     map[string]LookupMetadata `json:"lookups,omitempty"`
	Wizard      *WizardMetadata           `json:"wizard,omitempty"`
}

// LookupMetadata describes a named lookup block declared in the SQL module.
type LookupMetadata struct {
	DependsOn []string `json:"dependsOn"`
	Cache     string   `json:"cache,omitempty"` // block-level TTL (ex. 2m)
}

// QueryResult represents the result of a dynamic query execution, preserving column order.
type QueryResult struct {
	Columns    []string                 `json:"columns"`
	Rows       []map[string]interface{} `json:"rows"`
	ResultType string                   `json:"resultType,omitempty"`
	Messages   []UserMessage            `json:"messages,omitempty"`
	CanExecute *bool                    `json:"canExecute,omitempty"`
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
	ListProjects(basePath string, includeLibraries bool) ([]TreeNode, error)
	GetMetadata(basePath, queryPath, kind string) (MetadataResponse, error)
	ExecuteQuery(ctx context.Context, basePath, queryPath, kind, stepID string, wizardFinalExecute bool, payload map[string]interface{}, defaultDriver, defaultDsn string) (QueryResult, string, string, error)
	ExecuteNamedQuery(ctx context.Context, basePath, queryPath, kind, queryName string, payload map[string]interface{}, defaultDriver, defaultDsn string) (QueryResult, string, string, error)
	ExecuteLookup(ctx context.Context, basePath, queryPath, kind, lookupName, lookupField string, payload map[string]interface{}, defaultDriver, defaultDsn string) (LookupResult, string, string, error)
}
