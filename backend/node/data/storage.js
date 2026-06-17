const fs = require("fs");
const path = require("path");

const messagesPath = path.join(__dirname, "..", "..", "php", "data", "messages.json");
const contactRateLimitsPath = path.join(__dirname, "..", "..", "php", "data", "contact_rate_limits.json");

const databaseUrl = String(process.env.PORTFOLIO_DATABASE_URL || process.env.DATABASE_URL || "").trim();
const shouldUseDatabase = Boolean(databaseUrl);

let pool = null;
let initPromise = null;

const getPool = () => {
  if (!shouldUseDatabase) {
    return null;
  }

  if (!pool) {
    // Lazily require pg so local JSON mode does not require DB connectivity.
    // eslint-disable-next-line global-require
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.DB_SSL === "false" ? false : undefined
    });
  }

  return pool;
};

const ensureDb = async () => {
  if (!shouldUseDatabase) {
    return false;
  }

  if (!initPromise) {
    const db = getPool();
    initPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS contact_messages (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          subject TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS contact_rate_limits (
          ip TEXT PRIMARY KEY,
          count INTEGER NOT NULL,
          window_start BIGINT NOT NULL,
          last_attempt BIGINT NOT NULL
        );
      `);
    })();
  }

  await initPromise;
  return true;
};

const readJsonFile = async (filePath, fallback) => {
  try {
    const file = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(file || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
};

const writeJsonFile = async (filePath, value) => {
  await fs.promises.writeFile(filePath, JSON.stringify(value, null, 2));
};

const getMessages = async () => {
  if (await ensureDb()) {
    const db = getPool();
    const result = await db.query(
      "SELECT id, name, email, subject, message, created_at FROM contact_messages ORDER BY id ASC"
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      email: row.email,
      subject: row.subject,
      message: row.message,
      createdAt: new Date(row.created_at).toISOString()
    }));
  }

  return readJsonFile(messagesPath, []);
};

const addMessage = async ({ name, email, subject, message, createdAt }) => {
  if (await ensureDb()) {
    const db = getPool();
    const result = await db.query(
      `
        INSERT INTO contact_messages (name, email, subject, message, created_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, email, subject, message, created_at
      `,
      [name, email, subject, message, createdAt]
    );

    const row = result.rows[0];
    return {
      id: Number(row.id),
      name: row.name,
      email: row.email,
      subject: row.subject,
      message: row.message,
      createdAt: new Date(row.created_at).toISOString()
    };
  }

  const messages = await readJsonFile(messagesPath, []);
  const newMessage = {
    id: Date.now(),
    name,
    email,
    subject,
    message,
    createdAt
  };
  messages.push(newMessage);
  await writeJsonFile(messagesPath, messages);
  return newMessage;
};

const getRateLimits = async () => {
  if (await ensureDb()) {
    const db = getPool();
    const result = await db.query("SELECT ip, count, window_start, last_attempt FROM contact_rate_limits");

    return result.rows.reduce((acc, row) => {
      acc[row.ip] = {
        count: Number(row.count),
        windowStart: Number(row.window_start),
        lastAttempt: Number(row.last_attempt)
      };
      return acc;
    }, {});
  }

  return readJsonFile(contactRateLimitsPath, {});
};

const saveRateLimits = async (limits) => {
  if (await ensureDb()) {
    const db = getPool();
    await db.query("DELETE FROM contact_rate_limits");

    const ips = Object.keys(limits);
    for (const ip of ips) {
      const item = limits[ip];
      await db.query(
        `
          INSERT INTO contact_rate_limits (ip, count, window_start, last_attempt)
          VALUES ($1, $2, $3, $4)
        `,
        [ip, Number(item.count || 0), Number(item.windowStart || 0), Number(item.lastAttempt || 0)]
      );
    }

    return;
  }

  await writeJsonFile(contactRateLimitsPath, limits);
};

module.exports = {
  getMessages,
  addMessage,
  getRateLimits,
  saveRateLimits
};
