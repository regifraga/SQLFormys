package cache

// Status reports whether a cached execution used the in-memory store.
type Status string

const (
	StatusBypass Status = "BYPASS" // caching disabled (no TTL)
	StatusHit    Status = "HIT"
	StatusMiss   Status = "MISS"
)

func (s Status) String() string {
	if s == "" {
		return string(StatusBypass)
	}
	return string(s)
}