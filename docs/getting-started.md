# Getting started

You can run the complete project using Docker or by starting the services manually.

## Using Docker Compose

If you have Docker installed, run the following command in the repository root:

```bash
docker compose up --build
```

This spins up PostgreSQL (when enabled in your Compose file), the Go API, and the static frontend.

## Manual setup

**Backend:** In the `back` folder, copy `.env.example` to `.env`, configure settings, and start the server:

```bash
cd back
go run cmd/api/main.go
```

**Frontend:** The frontend is static. In `front`, copy `config.js.template` to `config.js`, set the API URL (default `http://localhost:8080/api`), then open `index.html` in the browser or use a local static server (for example the VS Code Live Server extension).

When running the API from `back`, the process must read `.env` from the current working directory. With Docker Compose, variables from the root `.env` are passed to the API service when it is enabled.

## Custom frontend title

Default branding in the browser tab and header is **SQLFormys**. To add a product or environment name (for example your company or `Homologation`), set **`PRODUCT_NAME`** in the project `.env` (see `.env.example` under the API section):

```env
PRODUCT_NAME=Acme Logistics
```

Restart the Go API after changing `.env`. On load, the frontend calls `GET /api/projects`; when `productName` is returned it updates:

- The **browser tab title** to `SQLFormys (Acme Logistics)`
- The **header logo text** to the same string

If `PRODUCT_NAME` is empty or unset, the UI keeps the defaults from `front/index.html` (`SQLFormys` only).

This setting is for **application branding** only. The title above each module form comes from the module name in the sidebar (the filename without extension); the subtitle path and optional `--DESCRIPTION=` / `#DESCRIPTION=` tag control other on-screen text.

## Application version

The version in the sidebar footer comes from the API (`GET /api/version`). To release a new version, edit [`back/internal/version/VERSION`](../back/internal/version/VERSION) and rebuild or restart the API (Docker image build embeds that file into the binary).

## API access log (file rotation)

Each HTTP request can be written to rotating log files (see **Log da API** in [`.env.example`](../.env.example)). Defaults: `back/logs/api.log`, rotation by size (`LOG_ROTATION=size`) or by calendar day (`daily` / `date`).

Example line:

```text
2026-03-23 14:30:00 | ip=127.0.0.1 | user=EMPRESA\regivaldo | GET | path=/api/projects query=foo=bar | status=200 | duration_ms=27
```

For `POST`/`PUT`/`PATCH`, the request body is truncated per `LOG_REQUEST_BODY_MAX_BYTES` (use `0` to disable). Handler errors emitted with `log.Printf` also go to the same file when `LOG_ENABLED=true`.

With Docker Compose, `./back/logs` is mounted at `/app/logs` inside the API container.

## See also

- [Authentication](authentication.md)
- [Modules overview](modules.md)
- [API tests](api-tests.md)