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

## Why SQLFormys?

Building repetitive CRUD interfaces for database tables takes a lot of time. SQLFormys connects raw SQL queries directly to functional web forms to bridge the gap between databases and users, making data input fast and straightforward.


