# Modules overview

Each **module** is a file under `back/queries/<project>/` with extension **`.sql`**, **`.sh`**, or **`.ps1`**. The filename without extension is the module name; the parent folder is the **project**. Only one extension may exist per basename in the same folder (you cannot have both `Consulta.sql` and `Consulta.sh` in the same directory).

The API and UI identify the language with query parameter **`kind=sql`**, **`kind=sh`**, or **`kind=ps1`** on `GET/POST /api/queries/...` and on admin read/write. The sidebar also returns `kind` on each module node.

| Kind | File | Execution |
| :--- | :--- | :--- |
| SQL | `.sql` | Parsed tags, variable injection, database connection (`--SERVER`) |
| Bash | `.sh` | `bash`, form fields as environment variables |
| PowerShell | `.ps1` | `pwsh -File`, fields as `$env:NAME` |

Shared concepts across kinds:

- **`PROPERTIES`** blocks define form fields (SQL uses `--`, scripts use `#`)
- Header tags: description, confirm/message modals, `EXECUTE_MODE`, `TIMEOUT`, `CACHE`, `INCLUDE`, `RESULT_TYPE`
- Optional **[wizard](wizard.md)** (`STEP` / `WIZARD`) for multi-step flows
- **`{{FIELD}}`** interpolation in UI strings (labels, confirms, wizard text)

SQL-specific features (LOOKUP, `--SERVER`, conditional SQL fragments) are documented in [SQL modules](sql-modules.md). Script details are in [Script modules](script-modules.md).

## Libraries and `INCLUDE`

Administrators can create a folder type **Library** in the sidebar (add menu). It holds reusable fragments grouped by product, area, and so on. Only administrators see Library folders and their modules in the tree; standard users can still run normal modules that reference fragments via `INCLUDE`.

- SQL: `--INCLUDE=...`
- Shell and PowerShell: `#INCLUDE=...` (same rules, same `kind` as the host)
- Includes may nest. Cycles and excessive depth are rejected.
- Only modules inside a Library tree may be referenced.
- Put module-level tags such as `--DESCRIPTION` / `#DESCRIPTION` and `--SERVER` **above** any `INCLUDE` lines so they apply to the host module.

## `RESULT_TYPE` (all kinds)

Controls how execution output is shown (case-insensitive). SQL defaults to **GRID**; script modules default to **TEXT**.

| Value | Behavior |
| :--- | :--- |
| `GRID` | Tabular grid (filter, sort, CSV/Excel export). |
| `TEXT` | Plain text (`<pre>`). |
| `HTML` | Full HTML document inside a sandboxed iframe. |
| `MARKDOWN` | Markdown rendered as HTML (sanitized). |
| `MERMAID` | Entire result treated as one Mermaid diagram. |
| `DOCUMENT` | Markdown plus embedded ` ```mermaid ` fenced blocks. |

For types other than `GRID`, the UI typically concatenates the **first column** of every result row with line breaks (SQL) or uses script stdout (`.sh` / `.ps1`). For **GRID** on scripts, stdout must be a JSON array of objects.

## API shape

- **GET** `/api/queries/<project>/<module>?kind=...` returns parsed fields as JSON for the form.
- **POST** runs the module with submitted values (SQL injection or script environment).

See [API tests](api-tests.md) for cURL examples.

## Next steps

- [SQL modules](sql-modules.md)
- [Script modules](script-modules.md)
- [Wizard](wizard.md)