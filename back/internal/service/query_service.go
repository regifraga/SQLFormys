package service

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"sqlformys/internal/domain"
	"sqlformys/internal/engine"
	"sqlformys/internal/library"
	"sqlformys/internal/modulekind"
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

func buildTree(basePath, currentDir, currentRelPath string, includeLibraries bool) ([]domain.TreeNode, error) {
	var nodes []domain.TreeNode

	entries, err := os.ReadDir(currentDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nodes, nil
		}
		return nil, err
	}

	seenBasename := make(map[string]string)

	for _, entry := range entries {
		if entry.Name() == library.MarkerFileName {
			continue
		}
		if entry.IsDir() {
			subDir := filepath.Join(currentDir, entry.Name())
			subRel := entry.Name()
			if currentRelPath != "" {
				subRel = currentRelPath + "/" + entry.Name()
			}

			inLib := library.IsLibraryRelPath(basePath, subRel)
			if !includeLibraries && inLib {
				continue
			}

			children, err := buildTree(basePath, subDir, subRel, includeLibraries)
			if err != nil {
				return nil, err
			}

			nodes = append(nodes, domain.TreeNode{
				Name:     entry.Name(),
				Type:     "folder",
				Library:  inLib,
				Children: children,
			})
			continue
		}

		ext := filepath.Ext(entry.Name())
		kind, ok := modulekind.KindFromExt(ext)
		if !ok {
			continue
		}
		moduleName := strings.TrimSuffix(entry.Name(), ext)
		if prev, dup := seenBasename[moduleName]; dup {
			log.Printf("WARN: ignorando módulo duplicado %s (%s); já existe %s", entry.Name(), kind, prev)
			continue
		}
		seenBasename[moduleName] = kind

		modRel := moduleName
		if currentRelPath != "" {
			modRel = currentRelPath + "/" + moduleName
		}

		nodes = append(nodes, domain.TreeNode{
			Name: moduleName,
			Type: "module",
			Kind: kind,
			Path: modRel,
		})
	}

	return nodes, nil
}

func (s *queryService) ListProjects(basePath string, includeLibraries bool) ([]domain.TreeNode, error) {
	nodes, err := buildTree(basePath, basePath, "", includeLibraries)
	if err != nil {
		return nil, fmt.Errorf("erro ao ler diretório de queries: %w", err)
	}
	return nodes, nil
}

func (s *queryService) GetMetadata(basePath, queryPath, kind string) (domain.MetadataResponse, error) {
	absPath, resolvedKind, err := modulekind.ResolveModule(basePath, queryPath, kind)
	if err != nil {
		return domain.MetadataResponse{}, err
	}
	content, err := os.ReadFile(absPath)
	if err != nil {
		return domain.MetadataResponse{}, fmt.Errorf("erro ao ler módulo: %w", err)
	}

	expanded, err := engine.ExpandIncludes(basePath, string(content), resolvedKind)
	if err != nil {
		return domain.MetadataResponse{}, err
	}

	parser, err := engine.ParseMetadataForKind(expanded, resolvedKind)
	if err != nil {
		return domain.MetadataResponse{}, fmt.Errorf("erro ao fazer parse do módulo: %w", err)
	}

	fields := parser.Fields
	lookupsMeta := map[string]domain.LookupMetadata{}
	if resolvedKind == modulekind.KindSQL {
		fields, lookupsMeta = engine.ApplyLookupDependencies(parser.Fields, parser.Lookups)
	}
	server := parser.Server
	if resolvedKind != modulekind.KindSQL {
		server = ""
	}
	return domain.MetadataResponse{
		Kind:        resolvedKind,
		Server:      server,
		Description: parser.Description,
		ExecuteMode: parser.ExecuteMode,
		ResultType:  parser.ResultType,
		Timeout:     parser.Timeout,
		Fields:      fields,
		Lookups:     lookupsMeta,
		Wizard:      parser.WizardMetadata(),
	}, nil
}

func (s *queryService) ExecuteQuery(ctx context.Context, basePath, queryPath, kind, stepID string, payload map[string]interface{}, defaultDriver, defaultDsn string) (domain.QueryResult, string, error) {
	absPath, resolvedKind, err := modulekind.ResolveModule(basePath, queryPath, kind)
	if err != nil {
		return domain.QueryResult{}, "", err
	}
	content, err := os.ReadFile(absPath)
	if err != nil {
		return domain.QueryResult{}, "", fmt.Errorf("erro ao ler módulo: %w", err)
	}

	expanded, err := engine.ExpandIncludes(basePath, string(content), resolvedKind)
	if err != nil {
		return domain.QueryResult{}, "", err
	}

	parser, err := engine.ParseMetadataForKind(expanded, resolvedKind)
	if err != nil {
		return domain.QueryResult{}, "", fmt.Errorf("erro ao fazer parse do módulo: %w", err)
	}

	if parser.HasWizard() {
		stepID = strings.TrimSpace(stepID)
		if stepID == "" {
			stepID = parser.LastStepID()
		}
		if _, ok := parser.StepByID(stepID); !ok {
			return domain.QueryResult{}, "", fmt.Errorf("step %q inválido", stepID)
		}
	}

	if resolvedKind != modulekind.KindSQL {
		if parser.HasWizard() {
			result, runErr := engine.RunScriptStep(ctx, absPath, resolvedKind, parser, payload, stepID, expanded)
			if runErr != nil {
				return result, "", runErr
			}
			result.ResultType = parser.ResultTypeForStep(stepID)
			return result, "", nil
		}
		result, runErr := engine.RunScript(ctx, absPath, resolvedKind, parser, payload, expanded)
		return result, "", runErr
	}

	if parser.HasWizard() {
		stepID = strings.TrimSpace(stepID)
		if stepID == "" {
			stepID = parser.LastStepID()
		}
		finalSQL, err := engine.InjectStepValues(expanded, stepID, resolvedKind, payload, parser.Fields, parser.ResultType, defaultDriver)
		if err != nil {
			return domain.QueryResult{}, "", err
		}
		if strings.TrimSpace(finalSQL) == "" {
			return domain.QueryResult{
				Columns:    []string{},
				Rows:       []map[string]interface{}{},
				ResultType: parser.ResultTypeForStep(stepID),
			}, "", nil
		}
		workParser := *parser
		workParser.ResultType = parser.ResultTypeForStep(stepID)
		return s.runPreparedSQL(ctx, &workParser, finalSQL, payload, defaultDriver, defaultDsn)
	}

	finalSQL := engine.InjectValues(expanded, payload, parser.Fields, defaultDriver)
	return s.runPreparedSQL(ctx, parser, finalSQL, payload, defaultDriver, defaultDsn)
}

func (s *queryService) ExecuteLookup(ctx context.Context, basePath, queryPath, kind, lookupName, lookupField string, payload map[string]interface{}, defaultDriver, defaultDsn string) (domain.LookupResult, string, error) {
	_, resolvedKind, err := modulekind.ResolveModule(basePath, queryPath, kind)
	if err != nil {
		return domain.LookupResult{}, "", err
	}
	if resolvedKind != modulekind.KindSQL {
		return domain.LookupResult{}, "", fmt.Errorf("LOOKUP não suportado neste tipo de módulo (%s)", resolvedKind)
	}

	absPath, _, err := modulekind.ResolveModule(basePath, queryPath, modulekind.KindSQL)
	if err != nil {
		return domain.LookupResult{}, "", err
	}
	content, err := os.ReadFile(absPath)
	if err != nil {
		return domain.LookupResult{}, "", fmt.Errorf("erro ao ler arquivo SQL: %w", err)
	}

	expanded, err := engine.ExpandIncludes(basePath, string(content), modulekind.KindSQL)
	if err != nil {
		return domain.LookupResult{}, "", err
	}

	parser, err := engine.ParseMetadata(expanded)
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

	finalSQL := engine.InjectLookupValues(expanded, lookupSQL, lookupField, payload, parser.Fields, defaultDriver)
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
