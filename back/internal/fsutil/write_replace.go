package fsutil

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

// WriteFileReplace writes data to path, using rename when possible and truncating
// the existing file when rename fails (e.g. Docker bind-mount of a single file).
func WriteFileReplace(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}

	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+"-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	success := false
	defer func() {
		if !success {
			_ = os.Remove(tmpName)
		}
	}()

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(perm); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}

	if err := os.Rename(tmpName, path); err == nil {
		success = true
		return nil
	} else if !isReplaceBusy(err) {
		return err
	}

	f, err := os.OpenFile(path, os.O_WRONLY|os.O_TRUNC, perm)
	if err != nil {
		if os.IsNotExist(err) {
			f, err = os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, perm)
		}
		if err != nil {
			return err
		}
	}
	defer f.Close()

	if _, err := f.Write(data); err != nil {
		return err
	}
	success = true
	return nil
}

func isReplaceBusy(err error) bool {
	if errors.Is(err, syscall.EBUSY) || errors.Is(err, syscall.EXDEV) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "device or resource busy") ||
		strings.Contains(msg, "resource busy")
}
