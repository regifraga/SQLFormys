# Guided wizard (`STEP` / `WIZARD`)

Use multiple **steps** when a module should collect parameters in stages and optionally run SQL or script logic between steps. The UI shows a stepper with **Anterior**, **Próximo**, and **Executar** (on the last step, or on the optional summary screen; see below).

SQL modules use `--` comment tags; Bash and PowerShell use `#` with the same block names (`#<STEP>`, `#<WIZARD>`, and so on).

## Variable interpolation in UI text

In **labels**, **help** (tooltip), **wizard step titles** (`STEP id: text` inside `<WIZARD>`), **`CONFIRM` / `MESSAGE`**, **wizard `MESSAGE` lines** (`ENTER` / `EXIT` / `FINISH`), and **runtime texts** from the result set (`DS_MESSAGE` / `__MESSAGE`: modals after step queries and the summary **VALIDATE** banner), you can reference form fields and wizard variables with `{{FIELD_NAME}}`. Spaces inside the braces are allowed (`{{ NM_ARQUIVO }}`).

| Token | Meaning |
|---|---|
| `{{FIELD_NAME}}` | Replaced in the UI with the current value of that field (from any wizard step already on the form). |
| Unknown name | Left unchanged (`{{UNKNOWN}}` stays as-is). |
| Known field, empty value | Replaced with an empty string. |

Use `{{…}}` instead of `@(…)`, `$(…)`, or `$VAR` so the text stays valid in SQL, Bash, and PowerShell. Interpolation applies **only to what the browser shows**; the executed SQL or script is not modified (values still go through normal injection / environment variables).

```sql
--<STEP ListarValores>
--<PROPERTIES>
-- SELECT @?#NM_ARQUIVO:VARCHAR:100:=:File name
--</PROPERTIES>
--</STEP>

--<STEP ValidarLista>
--<PROPERTIES>
-- SELECT @?#IC_TAMANHO2:CHAR:1:=:Show size column?:S:Include file size for {{NM_ARQUIVO}}
--</PROPERTIES>--</STEP>

--<WIZARD>
-- STEP ListarValores: Choose file
-- STEP ValidarLista: Validate {{NM_ARQUIVO}}
--</WIZARD>
```

After the user fills `NM_ARQUIVO` on step 1, the step 2 tooltip and stepper label show that value. Columns returned from a step query (for example `@MSG` in the first row) are also available in `{{…}}` once that step has run.

Example **VALIDATE** message with interpolation:

```sql
--<QUERY PodeExecutar>
-- SELECT CASE WHEN … THEN 'S' ELSE 'N' END AS IC_EXECUTE,
--        CASE WHEN … THEN '' ELSE 'Informe o nome do arquivo (do tipo: {{ IC_TIPO }}) para continuar.' END AS DS_MESSAGE
--</QUERY>
```

## Step structure

Wrap each step in `--<STEP StepId>` … `--</STEP>`. Each step contains its own `--<PROPERTIES>` block (same field syntax as [SQL modules](sql-modules.md)). Optional SQL (or script body) between `</PROPERTIES>` and `</STEP>` runs when the user clicks **Próximo** (`POST /api/queries/...?step=StepId`). Each line may be commented with `--` (or `#` in shell modules); the engine strips those prefixes before execution.

Inside a step you can use:

- **Inline SQL** (with or without `--` on every line), with the same features as the main module (`DECLARE`, variable injection, `/*[VAR=VAL]*/` fragments, assignments such as `SELECT @MSG = ...`).
- **`QUERY(Nome)`**: run a named `--<QUERY Nome>` block from the same file.
- **`--<QUERY Nome>` … `--</QUERY>` nested in the step**: registers that query for `QUERY(Nome)` / `SUMMARY QUERY(Nome)` and uses it as the step body when there is no other SQL after the block.

Inside `--<QUERY Nome>`, every SQL line may stay commented with `--`; the engine strips the prefix and executes the SQL. Use `--</QUERY>` or `--<QUERY>` as the closing tag.

Variables assigned in step SQL (for example `@MSG`) are returned in the result set when possible and can be referenced in wizard labels via `{{MSG}}`, or sent in the payload for the next request (summary named query or final execute).

The guided UI and step execution run **only** when the script contains a `--<WIZARD>` … `--</WIZARD>` block. `STEP` blocks alone do **not** enable the wizard (those modules keep a single form and **Executar**).

Define order and labels inside `--<WIZARD>` (if omitted, steps follow file order and use the step id as label).

### Hiding the stepper UI

To hide only the step progress area (“Etapa X de Y” and the step circles), **not** the step-by-step flow, add **`NO-STEPPER`** on the opening tag (aliases: `HIDE-STEPPER`, `HIDE-STEP-AREA`, or `UI=NO-STEPPER`). The same flag may appear as its own comment line inside the block (`-- NO-STEPPER`). Keep every `STEP …` line: omitting them or breaking the `<WIZARD>…</WIZARD>` block disables guided mode and shows all fields at once. Navigation still uses **Anterior** / **Próximo** in the footer.

```sql
--<WIZARD NO-STEPPER>
-- STEP ListarValores: Lista de valores
--</WIZARD>
```

```sql
--<STEP ListarValores>
--<PROPERTIES>
-- SELECT @?NM_ARQUIVO:VARCHAR:100:=:File name
--</PROPERTIES>
SELECT @NM_ARQUIVO AS Arquivo
--</STEP>

--<STEP Confirmacao>
--<PROPERTIES>
-- SELECT @?IC_CONFIRMA:CHAR:1:=:Confirma
--</PROPERTIES>
--</STEP>

--<WIZARD>
-- STEP ListarValores: Lista de valores
-- STEP Confirmacao: Confirma dos dados
--</WIZARD>
```

## Optional summary step (`SUMMARY`)

Only when explicitly requested, add a `SUMMARY` line inside `--<WIZARD>`. The UI then adds a **final** screen (after all real steps) with a table of field **labels** and friendly values for review. **Executar** appears only on that screen. **Próximo** on **every** step, including the last real step, runs that step’s SQL when the step has a query body, then advances (to the summary on the last step). **Executar** on the summary calls `POST /api/queries/...?step=LastStepId&wizardFinal=1`, which runs the SQL **outside** the `STEP` blocks (module residual), not the last step body again.

```sql
--<WIZARD>
-- STEP ListarValores: Lista de valores
-- STEP ValidarLista: Validação
-- STEP TipoArquivo: Tipo de Arquivo
-- SUMMARY
--</WIZARD>
```

Optional label (default **Resumo**):

```sql
-- SUMMARY: Confira os dados
```

Optional **field subset** (comma-separated variable names):

```sql
-- SUMMARY NM_ARQUIVO, DT_INICIAL
-- SUMMARY NM_ARQUIVO, DT_INICIAL: Confira os dados
-- SUMMARY: NM_ARQUIVO, DT_INICIAL
```

Unknown field names fail at parse time. Hidden/`CONTEXT` fields cannot be listed.

**`SUMMARY QUERY(…)`** runs a named `--<QUERY>` for a grid on the review screen instead of (or in addition to) field tables.

**`SUMMARY … VALIDATE(Nome)`** runs another named query to decide whether **Executar** is enabled. The first row may use either style (or both):

| Style | Columns | Rule on the **first row** |
|---|---|---|
| Explicit flag | `IC_EXECUTE` or `__CAN_EXECUTE` | `S`/`Y`/`1`/`true` = allow; `N`/`0`/`false` = block. When present, this column wins over message-only rules below. |
| Message-only | `DS_MESSAGE` or `__MESSAGE` (no execute flag) | Non-empty text = block (same as `IC_EXECUTE='N'`); empty string = allow. |

Optional `DS_MESSAGE` / `__MESSAGE` with an explicit flag still explains why execution is blocked (supports `{{FIELD}}`).

```sql
-- SUMMARY QUERY(Lista) VALIDATE(PodeExecutar): Confira os dados
-- SUMMARY VALIDATE(PodeExecutar)
```

If there is no `VALIDATE` query, the UI may read `IC_EXECUTE` from the summary preview query only. A **`SUMMARY QUERY` with zero rows** blocks **Executar** (banner *Nenhum registro para executar*), even when `VALIDATE` would allow. When the preview query has rows and no execute flag, **Executar** stays enabled (backward compatible).

## Wizard messages

Inside `--<WIZARD>`:

```sql
-- MESSAGE StepId ENTER WARNING: Texto ao entrar na etapa
-- MESSAGE StepId EXIT DANGER: Texto ao sair (Próximo; Cancelar permanece na etapa)
-- MESSAGE FINISH CONFIRM: Texto antes de Executar (antes de --CONFIRM)
```

Optional **`VALIDATE(Nome)`** on a message line (same named `--<QUERY>` and result protocol as **SUMMARY … VALIDATE**). When present, the UI runs that query at `ENTER`, `EXIT`, or `FINISH` with the current form values:

| First row of the VALIDATE query | Behavior |
|---|---|
| Allows and `DS_MESSAGE` / `__MESSAGE` is empty | Message is **skipped**; navigation continues |
| Allows and message text is non-empty | **Solicitation**: modal with text from the query (or static line as fallback); on `EXIT`/`FINISH`, Cancel stays on the step |
| Blocks (`IC_EXECUTE` = N, or message-only non-empty text, same rules as summary) | **Validation**: modal explains why; on `EXIT`/`FINISH` the step does not advance / execute even after OK; on `ENTER` the user is only informed |

```sql
-- MESSAGE ValidarLista EXIT VALIDATE(PodeExecutar) CONFIRM: Confirma que revisou a lista para {{ NM_ARQUIVO }}?
-- MESSAGE FINISH VALIDATE(PodeExecutar) DANGER: Não é possível executar.
```

Shell/PowerShell: `# MESSAGE StepId EXIT VALIDATE(PodeExecutar) CONFIRM: …` inside `#<WIZARD>`.

## Runtime messages

SQL result columns (stripped from the grid): `DS_MESSAGE` / `__MESSAGE`, optional `TP_MESSAGE` / `__MESSAGE_TYPE`, and `IC_EXECUTE` / `__CAN_EXECUTE` for validation (or message-only validation when the execute flag is omitted). The message text is shown in modals or on the summary **VALIDATE** banner and supports the same `{{FIELD}}` interpolation as static UI strings.

In shell/PowerShell stdout: `SQLFORMYS_MESSAGE=WARNING: …` infers a block when `SQLFORMYS_CAN_EXECUTE` is omitted; explicit `SQLFORMYS_CAN_EXECUTE=N` (lines removed from displayed output) still works as before.

Omit `SUMMARY` entirely for the previous behavior (**Executar** on the last real step). Shell/PowerShell use `# SUMMARY` (or `# SUMMARY: …`) inside `#<WIZARD>`.

## Rules

- Field names must be **unique across all steps**.
- `--RESULT_TYPE=` inside a step overrides the module default for that step only.
- On the **last** step, if the step has no SQL body, the engine runs the SQL **outside** the `STEP` blocks (same as a classic module). With **SUMMARY**, final **Executar** always uses that residual SQL (`wizardFinal=1`), even when the last step has its own query (which already ran on **Próximo**).
- Modules with **no** `--<WIZARD>` block behave exactly as before (single form + **Executar**), even if they contain `STEP` blocks.
- Modules with **no** `STEP` blocks are always classic modules.
- Shell/PowerShell modules use `#` instead of `--` for the same tags.

## See also

- [SQL modules](sql-modules.md)
- [Script modules](script-modules.md)
- [Modules overview](modules.md)