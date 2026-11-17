package cache

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
)

// KeyParts identifies a cached execution.
type KeyParts struct {
	QueryPath   string                 `json:"queryPath"`
	Kind        string                 `json:"kind"`
	ContentHash string                 `json:"contentHash"`
	Target      string                 `json:"target"`
	Driver      string                 `json:"driver"`
	Server      string                 `json:"server"`
	Payload     map[string]interface{} `json:"payload"`
}

// HashContent returns a stable hash of expanded module content.
func HashContent(content string) string {
	sum := sha256.Sum256([]byte(content))
	return hex.EncodeToString(sum[:])
}

// BuildKey returns a deterministic cache key.
func BuildKey(parts KeyParts) string {
	payload := parts.Payload
	if payload == nil {
		payload = map[string]interface{}{}
	}
	keys := make([]string, 0, len(payload))
	for k := range payload {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	normalized := make(map[string]interface{}, len(keys))
	for _, k := range keys {
		normalized[k] = payload[k]
	}
	parts.Payload = normalized
	b, _ := json.Marshal(parts)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// Target constants for KeyParts.Target.
func TargetExec() string            { return "exec" }
func TargetStep(stepID string) string {
	return fmt.Sprintf("step:%s", stepID)
}
func TargetNamed(name string) string {
	return fmt.Sprintf("named:%s", name)
}
func TargetLookup(name, field string) string {
	return fmt.Sprintf("lookup:%s:%s", name, field)
}