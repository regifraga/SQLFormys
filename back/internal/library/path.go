package library

import (
	"os"
	"path/filepath"
	"strings"

	"sqlformys/internal/filesafe"
)

// MarkerFileName is written at the root of a Biblioteca folder.
const MarkerFileName = ".sqlformys-library"

// HasMarker reports whether dir contains the library marker file.
func HasMarker(dir string) bool {
	info, err := os.Stat(filepath.Join(dir, MarkerFileName))
	return err == nil && !info.IsDir()
}

// IsLibraryRelPath reports whether rel (folder or module logical path) lies under a Biblioteca folder.
func IsLibraryRelPath(basePath, rel string) bool {
	rel = strings.Trim(strings.TrimSpace(rel), "/\\")
	if rel == "" {
		return false
	}
	basePath = strings.TrimSpace(basePath)
	parts := strings.Split(rel, "/")
	// Module path: check directory ancestors and self if it's a folder path without file
	for i := len(parts); i >= 1; i-- {
		prefix := strings.Join(parts[:i], "/")
		dir, err := filesafe.ResolveUnderBase(basePath, prefix)
		if err != nil {
			continue
		}
		if HasMarker(dir) {
			return true
		}
	}
	return false
}

// ModuleRelDir returns the parent folder logical path of a module (e.g. "A/B" for module "A/B/foo").
func ModuleRelDir(moduleRel string) string {
	moduleRel = strings.Trim(strings.TrimSpace(moduleRel), "/\\")
	if moduleRel == "" {
		return ""
	}
	if i := strings.LastIndex(moduleRel, "/"); i >= 0 {
		return moduleRel[:i]
	}
	return ""
}

// IsLibraryModule reports whether a module logical path is inside a Biblioteca tree.
func IsLibraryModule(basePath, moduleRel string) bool {
	moduleRel = strings.Trim(strings.TrimSpace(moduleRel), "/\\")
	if moduleRel == "" {
		return false
	}
	dir := ModuleRelDir(moduleRel)
	if dir == "" {
		// module at root — only library if root itself were marked (unusual)
		return IsLibraryRelPath(basePath, moduleRel)
	}
	if IsLibraryRelPath(basePath, dir) {
		return true
	}
	// module at root of library e.g. Bibliotecas/fragment — dir is Bibliotecas
	parts := strings.Split(moduleRel, "/")
	if len(parts) == 1 {
		return false
	}
	parent := strings.Join(parts[:len(parts)-1], "/")
	return IsLibraryRelPath(basePath, parent)
}