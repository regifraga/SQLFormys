package domain

type APIError struct {
	Error      string `json:"error"`
	DebugQuery string `json:"debug_query,omitempty"`
}
