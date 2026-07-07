// Updated 2026-07-07
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const databaseUrl = String(process.env.PORTFOLIO_DATABASE_URL || process.env.DATABASE_URL || "").trim();

if (!databaseUrl) {
  console.error("Missing PORTFOLIO_DATABASE_URL or DATABASE_URL for migration.");
  process.exit(1);
}

const migrationsDir = path.join(__dirname, "..", "..", "backend", "php", "sql", "migrations");
const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();

if (!files.length) {
  console.log("No migration files found.");
  process.exit(0);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DB_SSL === "false" ? false : undefined
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      process.stdout.write(`Applying migration ${file}... `);
      await client.query(sql);
      process.stdout.write("done\n");
    }
    await client.query("COMMIT");
    console.log("All migrations applied.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();

