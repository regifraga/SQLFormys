# SQLFormys 🚀

Welcome to **SQLFormys**! 

Have you ever wanted to instantly turn your SQL `SELECT` queries into dynamic, ready-to-use data entry forms (`INSERT`/`UPDATE`)? That's exactly what we do here! SQLFormys is built to empower users—even those without coding experience—to generate functional web forms directly from their database structures.

## ✨ What does it do?

- **Connects anywhere:** Hook up to your favorite relational databases (PostgreSQL, MySQL, SQLite, SQL Server).
- **Reads your tables:** Automatically fetches table structures, smartly picking up on primary and foreign keys.
- **Builds forms instantly:** Maps SQL data types (like `INT`, `VARCHAR`, `DATE`) straight to HTML inputs (`number`, `text`, `date`).
- **Keeps data safe:** Automatically handles constraints (like `NOT NULL` or `UNIQUE`) and uses parameterized queries to prevent SQL injection.

## 🛠️ Tech Stack

We love keeping things modern, fast, and robust:
- **Frontend:** React, Next.js 16, TypeScript
- **Backend:** Go 1.24+, htmx

## 🚀 Getting Started

Ready to spin it up locally? Here's how:

```bash
# Clone the repository
git clone https://github.com/regifraga/SQLFormys.git

# Hop into the project folder
cd SQLFormys

# Set up the backend
cd backend
go mod tidy

# Set up the frontend
cd ../frontend
npm install

# Start the dev server!
npm run dev
```

## 💡 Why SQLFormys?

SQLFormys is all about exploring the synergy between great open-source tools to build a scalable solution that removes the friction between raw data and end-users. No need to build custom CRUD screens for every single table anymore!

Happy coding, and let's make some forms! 🎉
