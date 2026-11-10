package service

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

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

func buildTree(currentDir string, currentRelPath string) ([]domain.TreeNode, error) {
	var nodes []domain.TreeNode

	entries, err := os.ReadDir(currentDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nodes, nil
		}
		return nil, err
	}

	for _, entry := range entries {
		if entry.IsDir() {
			subDir := filepath.Join(currentDir, entry.Name())
			subRel := entry.Name()
			if currentRelPath != "" {
				subRel = currentRelPath + "/" + entry.Name()
			}

			children, err := buildTree(subDir, subRel)
			if err != nil {
				return nil, err
			}

			nodes = append(nodes, domain.TreeNode{
				Name:     entry.Name(),
				Type:     "folder",
				Children: children,
			})
		} else if strings.HasSuffix(entry.Name(), ".sql") {
			moduleName := strings.TrimSuffix(entry.Name(), ".sql")
			modRel := moduleName
			if currentRelPath != "" {
				modRel = currentRelPath + "/" + moduleName
			}

			nodes = append(nodes, domain.TreeNode{
				Name: moduleName,
				Type: "module",
				Path: modRel,
			})
		}
	}

	return nodes, nil
}

func (s *queryService) ListProjects(basePath string) ([]domain.TreeNode, error) {
	nodes, err := buildTree(basePath, "")
	if err != nil {
		return nil, fmt.Errorf("erro ao ler diretório de queries: %w", err)
	}
	return nodes, nil
}

func (s *queryService) GetMetadata(basePath, queryPath string) (domain.MetadataResponse, error) {
	sqlFilePath := filepath.Join(basePath, queryPath+".sql")
	content, err := os.ReadFile(sqlFilePath)
	if err != nil {
		return domain.MetadataResponse{}, fmt.Errorf("erro ao ler arquivo SQL: %w", err)
	}

	parser, err := engine.ParseMetadata(string(content))
	if err != nil {
		return domain.MetadataResponse{}, fmt.Errorf("erro ao fazer parse do SQL: %w", err)
	}

	fields, lookupsMeta := engine.ApplyLookupDependencies(parser.Fields, parser.Lookups)
	return domain.MetadataResponse{
		Server:      parser.Server,
		Description: parser.Description,
		ExecuteMode: parser.ExecuteMode,
		ResultType:  parser.ResultType,
		Timeout:     parser.Timeout,
		Fields:      fields,
		Lookups:     lookupsMeta,
	}, nil
}

func (s *queryService) ExecuteQuery(ctx context.Context, basePath, queryPath string, payload map[string]interface{}, defaultDriver, defaultDsn string) (domain.QueryResult, string, error) {
	sqlFilePath := filepath.Join(basePath, queryPath+".sql")
	content, err := os.ReadFile(sqlFilePath)
	if err != nil {
		return domain.QueryResult{}, "", fmt.Errorf("erro ao ler arquivo SQL: %w", err)
	}

	parser, err := engine.ParseMetadata(string(content))
	if err != nil {
		return domain.QueryResult{}, "", fmt.Errorf("erro ao fazer parse do SQL: %w", err)
	}

	finalSQL := engine.InjectValues(string(content), payload, parser.Fields, defaultDriver)
	return s.runPreparedSQL(ctx, parser, finalSQL, payload, defaultDriver, defaultDsn)
}

func (s *queryService) ExecuteLookup(ctx context.Context, basePath, queryPath, lookupName, lookupField string, payload map[string]interface{}, defaultDriver, defaultDsn string) (domain.LookupResult, string, error) {
	sqlFilePath := filepath.Join(basePath, queryPath+".sql")
	content, err := os.ReadFile(sqlFilePath)
	if err != nil {
		return domain.LookupResult{}, "", fmt.Errorf("erro ao ler arquivo SQL: %w", err)
	}

	parser, err := engine.ParseMetadata(string(content))
	if err != nil {
		return domain.LookupResult{}, "", fmt.Errorf("erro ao fazer parse do SQL: %w", err)
	}

	lookupSQL, ok := parser.LookupSQL(lookupName)
	if !ok || strings.TrimSpace(lookupSQL) == "" {
		return domain.LookupResult{}, "", fmt.Errorf("lookup %q não encontrado no arquivo SQL", lookupName)
	}

	if err := engine.ValidateLookupPrerequisites(lookupSQL, lookupField, parser.Fields, payload); err != nil {
		return domain.LookupResult{}, "", err
	}

	finalSQL := engine.InjectLookupValues(string(content), lookupSQL, lookupField, payload, parser.Fields, defaultDriver)
	result, sql, err := s.runPreparedSQL(ctx, parser, finalSQL, payload, defaultDriver, defaultDsn)
	if err != nil {
		return domain.LookupResult{}, sql, err
	}

	return domain.LookupResult{
		Options: engine.MapLookupOptions(result),
	}, sql, nil
}

func (s *queryService) runPreparedSQL(ctx context.Context, parser *engine.SQLParser, finalSQL string, payload map[string]interface{}, defaultDriver, defaultDsn string) (domain.QueryResult, string, error) {
	driver := defaultDriver
	dsn := defaultDsn

	timeout := 60
	if parser.Timeout > 0 {
		timeout = parser.Timeout
	}
	ctx, cancel := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancel()

	if parser.Server != "" {
		// Se a query aponta para 'localhost' mas o DSN padrão usa 'db' (ex: rodando via Docker Compose),
		// não devemos substituir 'db' por 'localhost', pois no Docker o banco está no host 'db'.
		// Caso contrário (ex: apontando para um IP externo como 10.1.1.50), fazemos a substituição.
		if parser.Server != "localhost" || !strings.Contains(defaultDsn, "@db:") {
			dsn = strings.Replace(dsn, "localhost", parser.Server, 1)
			dsn = strings.Replace(dsn, "db", parser.Server, 1)
		}
	}

	db, err := s.connector.Connect(ctx, driver, dsn)
	if err != nil {
		return domain.QueryResult{}, finalSQL, fmt.Errorf("erro ao conectar no banco para query dinâmica: %w", err)
	}
	defer db.Close()

	isPostgres := driver == "postgres" || driver == "pgx"
	var tx *sql.Tx
	var rows *sql.Rows

	if isPostgres {
		tx, err = db.BeginTx(ctx, nil)
		if err != nil {
			return domain.QueryResult{}, finalSQL, fmt.Errorf("erro ao iniciar transação: %w", err)
		}
		defer tx.Rollback()

		// Inject variables into pg session configuration using set_config
		for _, field := range parser.Fields {
			val, exists := payload[field.Field]
			if !exists || val == nil {
				val = ""
			}
			valStr := fmt.Sprintf("%v", val)

			_, err = tx.ExecContext(ctx, "SELECT set_config($1, $2, true)", fmt.Sprintf("vars.%s", field.Field), valStr)
			if err != nil {
				return domain.QueryResult{}, finalSQL, fmt.Errorf("erro ao definir parâmetro %s: %w", field.Field, err)
			}
		}

		rows, err = tx.QueryContext(ctx, finalSQL)
	} else {
		rows, err = db.QueryContext(ctx, finalSQL)
	}

	if err != nil {
		return domain.QueryResult{}, finalSQL, fmt.Errorf("erro ao executar query: %w", err)
	}
	defer rows.Close()

	var columns []string
	for {
		columns, err = rows.Columns()
		if err == nil && len(columns) > 0 {
			break
		}
		if !rows.NextResultSet() {
			break
		}
	}

	var results []map[string]interface{}

	for rows.Next() {
		columnValues := make([]interface{}, len(columns))
		columnPointers := make([]interface{}, len(columns))
		for i := range columnValues {
			columnPointers[i] = &columnValues[i]
		}

		if err := rows.Scan(columnPointers...); err != nil {
			return domain.QueryResult{}, finalSQL, err
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

	if isPostgres {
		if err := tx.Commit(); err != nil {
			return domain.QueryResult{}, finalSQL, fmt.Errorf("erro ao fazer commit da transação: %w", err)
		}
	}

	return domain.QueryResult{
		Columns:    columns,
		Rows:       results,
		ResultType: parser.ResultType,
	}, finalSQL, nil
}
