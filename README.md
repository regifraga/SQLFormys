# SQLFormys

SQLFormys turns **query modules** (`.sql`, `.sh`, `.ps1`) into a web UI: dynamic forms from comment metadata, guided wizards, and rich result views (grids, text, HTML, Markdown, Mermaid). Use it for database queries, operational scripts, and reports without building one-off CRUD pages for every task.

## Key Features

- **Multi-kind modules:** SQL (PostgreSQL, MySQL, SQLite, SQL Server), Bash (`.sh`), and PowerShell (`.ps1`) under `back/queries/`
- **Dynamic forms:** Field definitions in `PROPERTIES` blocks map types to HTML controls (dates, numbers, dropdowns, LOOKUP, and more)
- **Wizards:** Multi-step flows with optional summary, validation queries, and step messages
- **Result presentation:** `GRID`, `TEXT`, `HTML`, `MARKDOWN`, `MERMAID`, `DOCUMENT`
- **Data export:** CSV and Excel from grid results
- **Interactive grid:** Filter and search in the UI
- **Favorites:** Quick access to frequently used modules
- **Libraries:** Reusable fragments via `INCLUDE` (admin-managed)
- **Security:** Parameterized SQL execution; optional Negotiate/Kerberos or Nginx HTTP Basic Auth
- **Smart parsing:** Header tags for description, timeouts, cache, confirm modals, and execution mode

## Tech Stack

- **Backend:** Go (standard library HTTP router)
- **Frontend:** Vanilla HTML, CSS, and JavaScript (served via Nginx)

## Quick start

With Docker installed, from the repository root:

```bash
docker compose up --build
```

This starts PostgreSQL (when enabled in Compose), the Go API, and the static frontend.

For manual setup, branding (`PRODUCT_NAME`), API logging, and version bumps, see [Getting started](docs/getting-started.md).

## Documentation

Full guides live in [`docs/`](docs/README.md):

| Guide | Contents |
| :--- | :--- |
| [Getting started](docs/getting-started.md) | Docker, manual setup, env, logs, version |
| [Authentication](docs/authentication.md) | Negotiate/Kerberos and Nginx HTTP Basic |
| [Modules overview](docs/modules.md) | Projects, `kind`, libraries, shared concepts |
| [SQL modules](docs/sql-modules.md) | Tags, properties, LOOKUP, examples |
| [Script modules](docs/script-modules.md) | Bash and PowerShell modules |
| [Wizard](docs/wizard.md) | Steps, summary, validation, interpolation |
| [API tests](docs/api-tests.md) | cURL examples for the API |
| [Project spec (legacy)](docs/spec.md) | Original requirements document |
| [Engine notes (legacy)](docs/engine-and-parser-workflow.md) | Early parser/workflow notes |

## License

[MIT License](LICENSE)