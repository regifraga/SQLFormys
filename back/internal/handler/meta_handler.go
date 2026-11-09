package handler

import (
	"net/http"

	"sqlformys/internal/config"
	"sqlformys/internal/version"
)

type MetaHandler struct {
	cfg *config.Config
}

func NewMetaHandler(cfg *config.Config) *MetaHandler {
	return &MetaHandler{cfg: cfg}
}

type versionResponse struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	ProductName string `json:"productName,omitempty"`
}

func (h *MetaHandler) Version(w http.ResponseWriter, r *http.Request) {
	respondWithJSON(w, http.StatusOK, versionResponse{
		Name:        version.AppName,
		Version:     version.Version(),
		ProductName: h.cfg.ProductName,
	})
}
