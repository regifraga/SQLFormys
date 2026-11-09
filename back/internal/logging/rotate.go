package logging

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type RotationMode string

const (
	RotationSize  RotationMode = "size"
	RotationDaily RotationMode = "daily"
)

// rotatingWriter grava em arquivo com rotação por tamanho ou por dia.
type rotatingWriter struct {
	mu sync.Mutex

	dir          string
	fileName     string
	mode         RotationMode
	maxSize      int64
	maxFiles     int
	current      *os.File
	currentSize  int64
	currentDay   string
	maxSizeBytes int64
}

func newRotatingWriter(dir, fileName string, mode RotationMode, maxSizeBytes int64, maxFiles int) (*rotatingWriter, error) {
	if maxFiles < 1 {
		maxFiles = 1
	}
	if maxSizeBytes < 1 {
		maxSizeBytes = 10 * 1024 * 1024
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("criar diretório de log %s: %w", dir, err)
	}

	w := &rotatingWriter{
		dir:          dir,
		fileName:     fileName,
		mode:         mode,
		maxSize:      maxSizeBytes,
		maxFiles:     maxFiles,
		maxSizeBytes: maxSizeBytes,
		currentDay:   time.Now().Format("2006-01-02"),
	}
	if err := w.openCurrent(); err != nil {
		return nil, err
	}
	return w, nil
}

func (w *rotatingWriter) path(name string) string {
	return filepath.Join(w.dir, name)
}

func (w *rotatingWriter) openCurrent() error {
	path := w.path(w.fileName)
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return err
	}
	w.current = f
	w.currentSize = info.Size()
	return nil
}

func (w *rotatingWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if err := w.maybeRotate(len(p)); err != nil {
		return 0, err
	}

	n, err := w.current.Write(p)
	if err != nil {
		return n, err
	}
	w.currentSize += int64(n)
	return n, nil
}

func (w *rotatingWriter) maybeRotate(incoming int) error {
	day := time.Now().Format("2006-01-02")
	if w.mode == RotationDaily && day != w.currentDay {
		if err := w.rotateDaily(); err != nil {
			return err
		}
		w.currentDay = day
		return nil
	}

	if w.mode == RotationSize && w.currentSize+int64(incoming) > w.maxSize && w.currentSize > 0 {
		return w.rotateBySize()
	}
	return nil
}

func (w *rotatingWriter) closeCurrent() error {
	if w.current == nil {
		return nil
	}
	err := w.current.Close()
	w.current = nil
	w.currentSize = 0
	return err
}

func (w *rotatingWriter) rotateBySize() error {
	if err := w.closeCurrent(); err != nil {
		return err
	}

	base := w.path(w.fileName)
	for i := w.maxFiles - 1; i >= 1; i-- {
		src := base + fmt.Sprintf(".%d", i)
		dst := base + fmt.Sprintf(".%d", i+1)
		if i == w.maxFiles-1 {
			_ = os.Remove(dst)
		}
		if _, err := os.Stat(src); err == nil {
			_ = os.Rename(src, dst)
		}
	}
	_ = os.Rename(base, base+".1")
	return w.openCurrent()
}

func (w *rotatingWriter) rotateDaily() error {
	if err := w.closeCurrent(); err != nil {
		return err
	}

	base := w.path(w.fileName)
	if info, err := os.Stat(base); err == nil && info.Size() > 0 {
		name := strings.TrimSuffix(w.fileName, filepath.Ext(w.fileName))
		ext := filepath.Ext(w.fileName)
		archive := w.path(fmt.Sprintf("%s.%s%s", name, w.currentDay, ext))
		_ = os.Rename(base, archive)
	}

	w.pruneDailyArchives()
	return w.openCurrent()
}

func (w *rotatingWriter) pruneDailyArchives() {
	prefix := strings.TrimSuffix(w.fileName, filepath.Ext(w.fileName))
	if prefix == w.fileName {
		prefix = w.fileName
	}
	ext := filepath.Ext(w.fileName)

	entries, err := os.ReadDir(w.dir)
	if err != nil {
		return
	}

	type archived struct {
		path string
		name string
	}
	var files []archived
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if name == w.fileName || strings.HasPrefix(name, w.fileName+".") {
			continue
		}
		if !strings.HasPrefix(name, prefix+".") {
			continue
		}
		if ext != "" && !strings.HasSuffix(name, ext) {
			continue
		}
		files = append(files, archived{path: w.path(name), name: name})
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].name > files[j].name
	})

	for i := w.maxFiles; i < len(files); i++ {
		_ = os.Remove(files[i].path)
	}
}

func (w *rotatingWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.closeCurrent()
}
