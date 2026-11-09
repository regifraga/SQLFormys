package logging

import (
	"bytes"
	"io"
	"net"
	"net/http"
	"strings"
)

func clientIP(r *http.Request) string {
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		if i := strings.Index(xff, ","); i > 0 {
			return strings.TrimSpace(xff[:i])
		}
		return xff
	}
	if xri := strings.TrimSpace(r.Header.Get("X-Real-IP")); xri != "" {
		return xri
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func formatHTTPValues(r *http.Request, bodyPreview string) string {
	var parts []string
	parts = append(parts, "path="+r.URL.Path)
	if q := r.URL.RawQuery; q != "" {
		parts = append(parts, "query="+q)
	}
	if bodyPreview != "" {
		parts = append(parts, "body="+bodyPreview)
	}
	return strings.Join(parts, " ")
}

type limitedBodyReader struct {
	rc    io.ReadCloser
	buf   bytes.Buffer
	limit int
}

func wrapRequestBody(r *http.Request, maxBytes int) string {
	if maxBytes <= 0 {
		return ""
	}
	if r.Body == nil {
		return ""
	}
	switch r.Method {
	case http.MethodPost, http.MethodPut, http.MethodPatch:
	default:
		return ""
	}

	lr := &limitedBodyReader{rc: r.Body, limit: maxBytes}
	r.Body = lr

	return "" // preenchido após a requisição via capturedBody()
}

func (l *limitedBodyReader) Read(p []byte) (int, error) {
	n, err := l.rc.Read(p)
	if n > 0 && l.buf.Len() < l.limit {
		remaining := l.limit - l.buf.Len()
		toCopy := n
		if toCopy > remaining {
			toCopy = remaining
		}
		_, _ = l.buf.Write(p[:toCopy])
	}
	return n, err
}

func (l *limitedBodyReader) Close() error {
	return l.rc.Close()
}

func capturedBody(r *http.Request) string {
	if r.Body == nil {
		return ""
	}
	if lr, ok := r.Body.(*limitedBodyReader); ok {
		s := strings.TrimSpace(lr.buf.String())
		s = strings.ReplaceAll(s, "\n", " ")
		s = strings.ReplaceAll(s, "\r", " ")
		if lr.buf.Len() >= lr.limit {
			return s + "…"
		}
		return s
	}
	return ""
}
