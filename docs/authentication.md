# Authentication

Authentication is **off by default**. Choose **Negotiate (Kerberos)** for domain-integrated deployments, or **Nginx HTTP Basic Auth** for Linux/Docker without Active Directory.

## Optional network authentication (IIS-style / Negotiate)

Set `AUTH_ENABLED=true` in the project `.env` to require a domain network identity on every `/api/*` call. There is **no password form** on the frontend: the browser performs a **Negotiate (Kerberos)** handshake, similar to IIS Windows Authentication.

| Variable | Role |
| :--- | :--- |
| `AUTH_ENABLED` | `false` (default) = open app; `true` = protect API |
| `AUTH_DEV_USER` | Only with `APP_ENV=development`: simulates `DOMAIN\user` on Linux without Active Directory |
| `AUTH_KRB_KEYTAB` | Production: path to the HTTP service keytab |
| `AUTH_KRB_SPN` | Production: service principal name (e.g. `HTTP/sqlformys.company.local`) |

When authentication is enabled, serve the UI through **Nginx** with `API_BASE_URL=/api` so static files and the API share the same origin. Cross-origin calls (`http://localhost:3000` to `http://localhost:8080`) break Negotiate. The frontend Dockerfile includes [`front/nginx.conf`](../front/nginx.conf) proxying `/api/` to the Go container.

**Development (auth on, no AD):**

```env
APP_ENV=development
AUTH_ENABLED=true
AUTH_DEV_USER=COMPANY\your.user
```

**Production:**

```env
AUTH_ENABLED=true
AUTH_KRB_KEYTAB=/path/to/http.keytab
AUTH_KRB_SPN=HTTP/sqlformys.company.local
API_BASE_URL=/api
```

The header shows the connected user after `GET /api/auth/me`. Browsers must treat the site as **intranet/trusted** for automatic Negotiate. If identity cannot be obtained, the UI shows “Não autenticado na rede” and does not load modules (no credential prompt).

Set `AUTH_ENABLED=false` in `front/config.js` (or via Docker `envsubst`) when running the static UI against a separate API URL during local development without auth.

## Deploy on Linux/Docker without Active Directory (HTTP Basic on Nginx)

When front and API run in containers on a Linux server **without** Kerberos/AD, use **Nginx HTTP Basic Auth** on the `front` container instead of `AUTH_KRB_*`. You manage users yourself; no AD/SPN/keytab is required.

| Variable | Role |
| :--- | :--- |
| `AUTH_ENABLED` | Keep **`false`** (API stays open behind the proxy; login is at Nginx) |
| `API_BASE_URL` | Use **`/api`** so the UI and API share the same origin through Nginx |
| `NGINX_BASIC_AUTH_ENABLED` | `true` to prompt for username/password in the browser |
| `NGINX_BASIC_AUTH_REALM` | Text shown in the browser login dialog |
| `NGINX_BASIC_AUTH_HTPASSWD_HOST_PATH` | Path on the **host** to the `htpasswd` file (default `./front/secrets/htpasswd`) |
| `NGINX_BASIC_AUTH_HTPASSWD_FILE` | Path **inside** the `front` container (default `/etc/nginx/secrets/htpasswd`) |
| `HTPASSWD_PATH` | Path **inside the API container** to the same htpasswd file (read/write for password changes and user admin) |
| `ADMINISTRATORS` | Comma-separated usernames seeded as admins on first run |
| `ADMINISTRATORS_FILE` | Host file listing current admins (default: `administrators` next to htpasswd) |

**1. Create credentials** (on the host):

```bash
mkdir -p front/secrets
htpasswd -bc front/secrets/htpasswd your.username
```

Or outside the repo, e.g. `/var/lib/sqlformys/htpasswd`, and set `NGINX_BASIC_AUTH_HTPASSWD_HOST_PATH` in `.env`.

(`apache2-utils` on Debian/Ubuntu; see [`front/secrets/README.md`](../front/secrets/README.md).)

**2. Configure `.env`:**

```env
AUTH_ENABLED=false
API_BASE_URL=/api
NGINX_BASIC_AUTH_ENABLED=true
NGINX_BASIC_AUTH_REALM=SQLFormys
# NGINX_BASIC_AUTH_HTPASSWD_HOST_PATH=/var/lib/sqlformys/htpasswd
```

**3. Start with Docker Compose.** The `front` service bind-mounts the host `htpasswd` file read-only; the `api` service mounts the **same** file read/write for in-app password changes and administrator user management. Create an empty administrators file on the host if needed, e.g. `touch ./administrators && chmod 600 ./administrators`, and set `ADMINISTRATORS_HOST_PATH` in `.env` when using a custom path.

**Add users later:** administrators can use **Usuários** in the sidebar UI, or run `htpasswd -b <host-path> newuser` on the server. Nginx re-reads the file per request - no container restart required.

**In the UI:** logged-in users see a profile badge beside the theme toggle (user icon vs shield for administrators). Everyone with Basic Auth configured can **Trocar senha** from that menu (current password required; strong password rules enforced). Administrators additionally manage users, edit modules (CodeMirror), and create or rename folders under `back/queries`.

Do **not** enable Kerberos (`AUTH_ENABLED=true`) and Basic Auth at the same time: both use the `Authorization` header and will conflict.

For defense in depth, you can still restrict network access (VPN, firewall) in addition to Basic Auth.

## See also

- [Getting started](getting-started.md)