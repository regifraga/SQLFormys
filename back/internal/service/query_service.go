package service

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"sqlformys/internal/domain"
	"sqlformys/internal/engine"
	"sqlformys/pkg/database"
)

type queryService struct {
	connector *database.Connector
}

// NewDynamicQueryService cria uma nova instância do serviço de queries dinâmicas
func NewDynamicQueryService(connector *database.Connector) domain.DynamicQueryService {
	return &queryService{
		connector: connector,
	}
}

func (s *queryService) ListProjects(basePath string) ([]domain.QueryProject, error) {
	var projects []domain.QueryProject

	entries, err := os.ReadDir(basePath)
	if err != nil {
		if os.IsNotExist(err) {
			return projects, nil
		}
		return nil, fmt.Errorf("erro ao ler diretório de queries: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			project := domain.QueryProject{
				Project: entry.Name(),
				Modules: []string{},
			}

			// Ler os arquivos .sql dentro do projeto
			projectPath := filepath.Join(basePath, entry.Name())
			files, err := os.ReadDir(projectPath)
			if err == nil {
				for _, file := range files {
					if !file.IsDir() && strings.HasSuffix(file.Name(), ".sql") {
						moduleName := strings.TrimSuffix(file.Name(), ".sql")
						project.Modules = append(project.Modules, moduleName)
					}
				}
			}

			if len(project.Modules) > 0 {
				projects = append(projects, project)
			}
		}
	}

	return projects, nil
}

func (s *queryService) GetMetadata(basePath, project, module string) (domain.MetadataResponse, error) {
	sqlFilePath := filepath.Join(basePath, project, module+".sql")
	content, err := os.ReadFile(sqlFilePath)
	if err != nil {
		return nil, fmt.Errorf("erro ao ler arquivo SQL: %w", err)
	}

	parser, err := engine.ParseMetadata(string(content))
	if err != nil {
		return nil, fmt.Errorf("erro ao fazer parse do SQL: %w", err)
	}

	return parser.Fields, nil
}

func (s *queryService) ExecuteQuery(ctx context.Context, basePath, project, module string, payload map[string]interface{}, defaultDriver, defaultDsn string) ([]map[string]interface{}, string, error) {
	sqlFilePath := filepath.Join(basePath, project, module+".sql")
	content, err := os.ReadFile(sqlFilePath)
	if err != nil {
		return nil, "", fmt.Errorf("erro ao ler arquivo SQL: %w", err)
	}

	parser, err := engine.ParseMetadata(string(content))
	if err != nil {
		return nil, "", fmt.Errorf("erro ao fazer parse do SQL: %w", err)
	}

	finalSQL := engine.InjectValues(string(content), payload, parser.Fields)

	driver := defaultDriver
	dsn := defaultDsn

	if parser.Server != "" {
		// Substitui os placeholders padrões pelo host apontado na tag --SERVER=
		dsn = strings.Replace(dsn, "localhost", parser.Server, 1)
		dsn = strings.Replace(dsn, "db", parser.Server, 1) 
	}

	db, err := s.connector.Connect(ctx, driver, dsn)
	if err != nil {
		return nil, finalSQL, fmt.Errorf("erro ao conectar no banco para query dinâmica: %w", err)
	}
	defer db.Close()

	// Execute the query
	rows, err := db.QueryContext(ctx, finalSQL)
	if err != nil {
		return nil, finalSQL, fmt.Errorf("erro ao executar query: %w", err)
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, finalSQL, err
	}

	var results []map[string]interface{}

	for rows.Next() {
		columnValues := make([]interface{}, len(columns))
		columnPointers := make([]interface{}, len(columns))
		for i := range columnValues {
			columnPointers[i] = &columnValues[i]
		}

		if err := rows.Scan(columnPointers...); err != nil {
			return nil, finalSQL, err
		}

		rowData := make(map[string]interface{})
		for i, colName := range columns {
			val := columnValues[i]
			
			b, ok := val.([]byte)
			if ok {
				rowData[colName] = string(b)
			} else {
				rowData[colName] = val
			}
		}

		results = append(results, rowData)
	}

	return results, finalSQL, nil
}
