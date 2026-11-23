# Script modules (Bash and PowerShell)

Script modules reuse the same **form tags** and **PROPERTIES** syntax as SQL modules, but metadata comments use **`#`** instead of `--`.

| Tag | Purpose |
| --- | --- |
| `#DESCRIPTION=...` | Short text in the UI |
| `#EXECUTE_MODE=AUTO` | Run on load (same as SQL). Ignored when `#CONFIRM` is set. |
| `#CONFIRM` / `#CONFIRM=CONFIRM` | Same as `--CONFIRM` (modal before **Executar**). |
| `#CONFIRM=WARNING: …` / `#CONFIRM=DANGER: …` | Same as SQL variants (`#` instead of `--`). |
| `#MESSAGE=...` | Same as `--MESSAGE=...` |
| `#RESULT_TYPE=...` | Defaults to **TEXT** (not GRID). Use **GRID** only if stdout is a JSON array of objects |
| `#TIMEOUT=60` | Process timeout in seconds |
| `#CACHE=15s` | Cache module execution (same TTL rules as SQL) |
| `#INCLUDE=...` | Same as `--INCLUDE` (Library fragments, same file kind) |
| `#<PROPERTIES>` / `#</PROPERTIES>` | Form fields (same `?`, `#` required, types as SQL) |

On execute, the API runs the file with **`bash`** (`.sh`) or **`pwsh -File`** (`.ps1`) and passes each form field as an **environment variable** (`NM_ARQUIVO=...` / PowerShell `$env:NM_ARQUIVO`). There is **no** `--SERVER=`, **no** SQL injection, and **no** LOOKUP blocks against the database.

Wizard blocks use `#<STEP>`, `#<WIZARD>`, and `# MESSAGE` lines; see [Wizard](wizard.md).

## Example `.sh`

```bash
#!/usr/bin/env bash
#DESCRIPTION=Listar diretório
#RESULT_TYPE=TEXT

#<PROPERTIES>
# @?#DIR:VARCHAR:200:=:Caminho
#</PROPERTIES>

ls -la "${DIR:-.}"
```

## Example `.ps1`

```powershell
#DESCRIPTION=Contagem de linhas
#RESULT_TYPE=TEXT

#<PROPERTIES>
# @?#ARQUIVO:VARCHAR:260:=:Arquivo
#</PROPERTIES>

(Get-Content -Path $env:ARQUIVO -ErrorAction Stop | Measure-Object -Line).Lines
```

## Runtime messages (stdout)

Shell/PowerShell may emit:

- `SQLFORMYS_MESSAGE=WARNING: …` (and similar) for modals
- `SQLFORMYS_CAN_EXECUTE=N` to block execution (lines removed from displayed output)

See [Wizard](wizard.md) for runtime message columns in SQL and script output protocols.

## Docker and `pwsh`

The API image includes **bash** (`.sh`) and **PowerShell 7** (`pwsh` at `/usr/local/bin/pwsh`) for `.ps1`. After changing the API `Dockerfile`, run `docker compose build api`. Outside Docker, install `pwsh` on the host or set `PWSH_PATH` in the API environment.

## See also

- [Modules overview](modules.md)
- [Wizard](wizard.md)