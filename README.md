# SQLFormys

SQLFormys is a tool that turns SQL queries into dynamic data entry forms (like INSERT/UPDATE). The goal is to make it easy to input data into your database tables through a simple web interface, without having to build custom CRUD pages from scratch.

## Key Features

- **Dynamic Form Generation:** Maps SQL data types (like INT, VARCHAR, DATE) to the appropriate HTML input types automatically.
- **Data Export:** Download query results easily in CSV or Excel formats.
- **Interactive Grid:** Filter and search through query results dynamically right from the UI.
- **Favorites Menu:** Save your most-used modules or tables to a quick-access favorites section.
- **Smart Parsing:** Automatically reads metadata like table structures, description tags, primary/foreign keys, and execution modes from your SQL comments.
- **Database Compatibility:** Supports standard relational databases such as PostgreSQL, MySQL, SQLite, and SQL Server.
- **Secure by Default:** Utilizes parameterized queries to protect your database from SQL injection.

## Tech Stack

- **Backend:** Go (using the standard library HTTP router)
- **Frontend:** Vanilla HTML, CSS, and JavaScript (served via Nginx)

## Getting Started

You can run the complete project using Docker or by starting the services manually.

### 1. Using Docker Compose

If you have Docker installed, simply run the following command in the root directory:

```bash
docker compose up --build
```

This will spin up the PostgreSQL database, the Go API, and the static frontend automatically.

### 2. Manual Setup

If you prefer to run the services individually on your local machine:

**Backend:**
Go to the `back` folder, copy `.env.example` to a new `.env` file, configure your settings, and start the server:

```bash
cd back
go run cmd/api/main.go
```

**Frontend:**
The frontend consists of static files. To run it locally:
1. In the `front` folder, copy `config.js.template` to a new file named `config.js`.
2. Configure the API URL (by default, `http://localhost:8080/api`).
3. Open `index.html` in your browser, or use a local static server (like the VS Code Live Server extension).

### Custom frontend title

The default branding in the browser tab and top header is **SQLFormys**. To show a custom product or environment name next to it (for example your company or `Homologation`), set **`PRODUCT_NAME`** in the project `.env` file (see `.env.example` under the API section).

```env
PRODUCT_NAME=Acme Logistics
```

Restart the Go API after changing `.env`. When the page loads, the frontend calls `GET /api/projects`; if `productName` is returned, it updates:

- The **browser tab title** to `SQLFormys (Acme Logistics)`
- The **header logo text** to the same string

If `PRODUCT_NAME` is empty or unset, the UI keeps the defaults from `front/index.html` (`SQLFormys` only).

**Note:** This setting is for application branding. The title above each module form comes from the module name in the sidebar (the `.sql` filename); the subtitle path and the optional `--DESCRIPTION=` header tag control other on-screen text for that module.

When running the API manually from the `back` folder, ensure the process can read your `.env` (the backend loads `.env` from the current working directory). With Docker Compose, variables from the root `.env` are passed to the API service when it is enabled.

## Writing query modules

Each `.sql` file under `back/queries/<project>/` becomes a module in the UI. The filename (without `.sql`) is the module name; the parent folder is the project.

The engine reads **comment tags** in the file: header metadata, a `--<PROPERTIES>` block that describes form fields, and optional inline conditionals in the SQL itself.

### Header tags

Place these at the top of the file (outside the properties block):

| Tag | Purpose |
|---|---|
| `--SERVER=...` | Database host/connection. If omitted, the API default is used. |
| `--DESCRIPTION=...` | Short text shown for the module in the UI. |
| `--EXECUTE_MODE=AUTO` | Run as soon as the form is submitted (no extra confirmation). |
| `--TIMEOUT=10` | Query timeout in seconds. Defaults to **60** if missing or invalid. |
| `--<PROPERTIES>` / `--</PROPERTIES>` | Block that defines the form fields. |

```sql
--SERVER=localhost
--DESCRIPTION=Search files by name
--EXECUTE_MODE=AUTO
--TIMEOUT=30
```

### Properties block

Every field the user should fill in goes between `--<PROPERTIES>` and `--</PROPERTIES>`. Only commented lines that contain `?` are parsed.

Basic shape:

```text
-- PREFIX @?#FIELD_NAME:TYPE:SIZE:OPERATOR:Label:default:help
```

| Segment | Meaning |
|---|---|
| Prefix | SQL fragment reused on injection (`SELECT`, `AND`, `WHERE`, …). On PostgreSQL the block is removed and values are exposed as session vars (`current_setting('vars.FIELD_NAME')`). |
| `@` | Treat as a variable assignment (`SELECT @NAME = value` on SQL Server). Without `@`, the line is injected as a filter (`AND COLUMN = value`). |
| `?` | Ask the user (required for the line to become a form control). |
| `#` | Required field. Omit `#` to make it optional. |
| `FIELD_NAME` | Variable / column name. |
| `TYPE` | Controls which HTML input is rendered (see below). |
| `SIZE` | Display size / `maxLength` for text. |
| `OPERATOR` | Comparison used on injection (`=`, `LIKE`, …). |
| `Label` | Text shown next to the control. |
| `default` | Optional default value. |
| `help` | Optional tooltip (info icon). |

```sql
--<PROPERTIES>
-- SELECT @?NM_ARQUIVO:VARCHAR:100:=:File name
-- SELECT @?#IC_TAMANHO:CHAR:1:=:Show size column?:S:Include the size column in the result
--</PROPERTIES>
```

### Field types (controls)

| Type | Control | Example |
|---|---|---|
| `VARCHAR` / `TEXT` / anything else | Text input (`maxLength` = size) | `@?NM_ARQUIVO:VARCHAR:100:=:File name` |
| `CHAR` with size `1` | Yes (`S`) / No (`N`) radios | `@?#IC_TAMANHO:CHAR:1:=:Show size?:S:Help text` |
| `INT` / `INTEGER` / `NUMERIC` / `DECIMAL` / `FLOAT` | Number input | `@?CD_REMETENTE:INT:8:=:Sender` |
| `DATE` / `DATETIME` / `TIMESTAMP` | Date picker | `@?#DT_INICIAL:DATE:8:=:Start date` |
| `SINGLE(value=label,...)` | Single-select dropdown | `@?IC_TIPO:SINGLE(S=Simple,V=Several):VARCHAR:10:=:Type:N` |
| `MULTI(...)` or `MULTIPLE(...)` | Multi-select dropdown | `@?#SG_UF:MULTI(SP=São Paulo,RJ=Rio de Janeiro):VARCHAR:80:=:States:SP,RJ` |
| `LOOKUP(Name)` | Single-select filled by a named query in the same `.sql` file | `@?CD_USUARIO:LOOKUP(NomeDoLookUp):VARCHAR:10:=:User` |
| `LOOKUP_MULTI(Name)` | Multi-select filled by a named query | `@?#SG_UF:LOOKUP_MULTI(UFsAtendimento):VARCHAR:80:=:States` |

`SINGLE` / `MULTI` / `LOOKUP` / `LOOKUP_MULTI` need an extra SQL type after the parentheses (`VARCHAR`, `INT`, …). That is the type sent to the database.

Option and multi-default separators: `,` `;` or `|`.

```sql
-- SELECT @?IC_TIPO:SINGLE(S=Simple,V=Several,A=Some,Nenhum):VARCHAR:10:=:Type:N:Pick one value
-- SELECT @?#SG_UF:MULTI(AC=Acre,AL=Alagoas,SP=São Paulo,RJ=Rio de Janeiro,MG=Minas Gerais):VARCHAR:80:=:States:SP,RJ:Select one or more UFs
```

There is no dedicated `TEXTAREA`, `TIME`, or `BOOLEAN` type. Anything that is not `CHAR:1`, a date, a number, `SINGLE`, `MULTI`, or `LOOKUP` is rendered as a text box.

### Lookup queries (dynamic dropdowns)

Use `LOOKUP` when the options should come from the database instead of a static list. Define a named query in the same `.sql` file (outside `--<PROPERTIES>`):

```sql
--<LOOKUP NomeDoLookUp>
SELECT CdUsuario AS Code, NmUsuario AS Value
FROM COR_USUARIO
WHERE CdEmpresa = @CD_EMPRESA
--</LOOKUP>
```

Then point a field at that name:

```sql
-- SELECT @?CD_USUARIO:LOOKUP(NomeDoLookUp):VARCHAR:10:=:User::Pick a user
```

Opening the dropdown in the UI runs `POST /api/lookups/{module}?name=NomeDoLookUp` with the current form values. The lookup SQL receives the same variables as the main query (`SELECT @CD_EMPRESA=...` on SQL Server, `current_setting('vars.CD_EMPRESA')` on PostgreSQL) and also supports `/*[VAR=VAL]*/.../*[/VAR]*/` fragments. After options load, the dropdown includes a **search box** that filters the list locally by code or label.

The lookup result should expose **Code** (option value) and **Value** (option label). If those aliases are missing, the first two columns are used. Lookup blocks are stripped before the main module query runs.

### Operators

The fourth segment is the SQL operator. Common values:

- `=` — equality / variable assignment
- `LIKE` — on SQL Server the value is wrapped as `'%...%'`

Numeric types (`INT`, `DECIMAL`, `NUMERIC`, `FLOAT`) are injected unquoted; everything else is quoted.

```sql
-- AND ?A.NM_CLIENTE:VARCHAR:50:LIKE:Customer name
-- AND ?#A.CD_MARKETPLACE:INT:4:=:Marketplace code
```

### Conditional fragments in the query

You can include or drop pieces of SQL based on a field value:

```sql
/*[IC_TAMANHO=S]*/NR_TAMANHO_BYTES as "Size",/*[/IC_TAMANHO]*/
```

If `IC_TAMANHO` equals `S`, the inner fragment stays; otherwise it is removed. Use this to toggle columns, joins, or parts of `WHERE`.

### Complete example (PostgreSQL)

```sql
--SERVER=localhost
--DESCRIPTION=Search files by name
--EXECUTE_MODE=AUTO

--<PROPERTIES>
-- SELECT @?NM_ARQUIVO:VARCHAR:100:=:File name
-- SELECT @?#IC_TAMANHO:CHAR:1:=:Show size column?:S:The size column is returned only when Yes is selected
-- SELECT @?#SG_UF:MULTI(SP=São Paulo,RJ=Rio de Janeiro,MG=Minas Gerais):VARCHAR:80:=:States:SP,RJ:Select one or more UFs
--</PROPERTIES>

SELECT
    CD_ARQUIVO as "Id",
    NM_ARQUIVO as "Description",
    /*[IC_TAMANHO=S]*/NR_TAMANHO_BYTES as "Size",/*[/IC_TAMANHO]*/
    DH_REGISTRO as "Date"
FROM dbo.COR_ARQUIVO
WHERE (
    current_setting('vars.NM_ARQUIVO', true) IS NULL
    OR current_setting('vars.NM_ARQUIVO', true) = ''
    OR NM_ARQUIVO LIKE '%' || current_setting('vars.NM_ARQUIVO', true) || '%'
)
AND (
    current_setting('vars.SG_UF', true) IS NULL
    OR current_setting('vars.SG_UF', true) = ''
    OR SG_UF = ANY(string_to_array(current_setting('vars.SG_UF', true), ','))
);
```

On PostgreSQL the properties block is stripped and values are set as session variables before the query runs.

### Complete example (SQL Server)

On SQL Server the same `--<PROPERTIES>` block is **replaced** with assignment statements (`SELECT @NM_ARQUIVO='...'`). Declare the variables first; the query then reads those `@` variables.

```sql
--SERVER=localhost
--DESCRIPTION=Search files by name
--EXECUTE_MODE=AUTO

DECLARE @NM_ARQUIVO VARCHAR(100),
        @IC_TAMANHO CHAR(1),
        @SG_UF      VARCHAR(80)

--<PROPERTIES>
-- SELECT @?NM_ARQUIVO:VARCHAR:100:=:File name
-- SELECT @?#IC_TAMANHO:CHAR:1:=:Show size column?:S:The size column is returned only when Yes is selected
-- SELECT @?#SG_UF:MULTI(SP=São Paulo,RJ=Rio de Janeiro,MG=Minas Gerais):VARCHAR:80:=:States:SP,RJ:Select one or more UFs
--</PROPERTIES>

SELECT
    CD_ARQUIVO as [Id],
    NM_ARQUIVO as [Description],
    /*[IC_TAMANHO=S]*/NR_TAMANHO_BYTES as [Size],/*[/IC_TAMANHO]*/
    DH_REGISTRO as [Date]
FROM dbo.COR_ARQUIVO
WHERE (
    @NM_ARQUIVO IS NULL
    OR @NM_ARQUIVO = ''
    OR NM_ARQUIVO LIKE '%' + @NM_ARQUIVO + '%'
)
AND (
    @SG_UF IS NULL
    OR @SG_UF = ''
    OR SG_UF IN (SELECT LTRIM(RTRIM([value])) FROM STRING_SPLIT(@SG_UF, ','))
)
```

After a POST with `NM_ARQUIVO=valotes`, `IC_TAMANHO=S` and `SG_UF=SP,RJ`, the properties block becomes:

```sql
SELECT @NM_ARQUIVO='valotes'
SELECT @IC_TAMANHO='S'
SELECT @SG_UF='SP,RJ'
```

You can also put filters **inside** the properties block (no `@`). Those lines are injected as `AND` / `WHERE` predicates, and `LIKE` wraps the value with `%...%`:

```sql
--<PROPERTIES>
-- AND ?#A.CD_MARKETPLACE:INT:4:=:Marketplace code
-- AND ?A.NM_CLIENTE:VARCHAR:50:LIKE:Customer name
--</PROPERTIES>
```

On **GET** `/query/<project>/<module>` the API returns the parsed fields as JSON so the frontend can render the form. On **POST** the submitted values are injected and the query is executed.

## Why SQLFormys?

Building repetitive CRUD interfaces for database tables takes a lot of time. SQLFormys connects raw SQL queries directly to functional web forms to bridge the gap between databases and users, making data input fast and straightforward.


