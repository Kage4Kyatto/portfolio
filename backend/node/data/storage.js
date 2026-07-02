const fs = require("fs");
const path = require("path");

const defaultDataDir = path.join(__dirname, "..", "..", "php", "data");
const configuredDataDir = String(process.env.PORTFOLIO_DATA_DIR || "").trim();
const dataDir = configuredDataDir ? path.resolve(configuredDataDir) : defaultDataDir;

const messagesPath = path.join(dataDir, "messages.json");
const contactRateLimitsPath = path.join(dataDir, "contact_rate_limits.json");
const adminAuthAttemptsPath = path.join(dataDir, "admin_auth_attempts.json");
const notificationQueuePath = path.join(dataDir, "notification_queue.json");
const telemetryPath = path.join(dataDir, "telemetry_events.json");
const TELEMETRY_RETENTION_LIMIT = 1000;

const databaseUrl = String(process.env.PORTFOLIO_DATABASE_URL || process.env.DATABASE_URL || "").trim();
const shouldUseDatabase = Boolean(databaseUrl);

let pool = null;
let initPromise = null;
let messageBackfillDone = false;

const getPool = () => {
  if (!shouldUseDatabase) {
    return null;
  }

  if (!pool) {
    // Lazily require pg so local JSON mode does not require DB connectivity.
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
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

      await db.query(`
        CREATE TABLE IF NOT EXISTS admin_auth_attempts (
          ip TEXT PRIMARY KEY,
          count INTEGER NOT NULL,
          first_attempt_at BIGINT NOT NULL,
          last_attempt_at BIGINT NOT NULL,
          locked_until BIGINT NOT NULL
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS notification_queue (
          id BIGINT PRIMARY KEY,
          payload JSONB NOT NULL,
          attempts INTEGER NOT NULL,
          next_attempt_at BIGINT NOT NULL
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS telemetry_events (
          id BIGSERIAL PRIMARY KEY,
          event TEXT NOT NULL,
          path TEXT NOT NULL,
          locale TEXT NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // Create indexes for commonly queried fields
      await db.query(`CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages(created_at DESC);`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_notification_queue_next_attempt ON notification_queue(next_attempt_at);`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_events(timestamp DESC);`);
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
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(value, null, 2));
};

const ensureMessagesBackfilledToDb = async (db) => {
  if (messageBackfillDone) {
    return;
  }

  const countResult = await db.query("SELECT COUNT(*)::int AS total FROM contact_messages");
  const total = Number(countResult.rows[0]?.total || 0);
  if (total > 0) {
    messageBackfillDone = true;
    return;
  }

  const jsonMessages = await readJsonFile(messagesPath, []);
  if (!Array.isArray(jsonMessages) || jsonMessages.length === 0) {
    messageBackfillDone = true;
    return;
  }

  const names = [];
  const emails = [];
  const subjects = [];
  const messages = [];
  const createdAtValues = [];

  for (const item of jsonMessages) {
    const name = String(item?.name || "").trim();
    const email = String(item?.email || "").trim();
    const subject = String(item?.subject || "").trim();
    const message = String(item?.message || "").trim();
    const rawCreatedAt = String(item?.createdAt || item?.timestamp || "").trim();
    const parsedCreatedAt = Date.parse(rawCreatedAt);
    const createdAt = Number.isFinite(parsedCreatedAt)
      ? new Date(parsedCreatedAt).toISOString()
      : new Date().toISOString();

    if (!name || !email || !subject || !message) {
      continue;
    }

    names.push(name);
    emails.push(email);
    subjects.push(subject);
    messages.push(message);
    createdAtValues.push(createdAt);
  }

  if (names.length === 0) {
    messageBackfillDone = true;
    return;
  }

  await db.query(
    `
      INSERT INTO contact_messages (name, email, subject, message, created_at)
      SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[])
    `,
    [names, emails, subjects, messages, createdAtValues]
  );

  messageBackfillDone = true;
};

// Helper to abstract DB vs JSON branching pattern
const useDbOrJson = async (dbFn, jsonFn) => {
  if (await ensureDb()) {
    return dbFn(getPool());
  }
  return jsonFn();
};

const getMessages = async () => {
  return useDbOrJson(
    async (db) => {
      await ensureMessagesBackfilledToDb(db);
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
    },
    () => readJsonFile(messagesPath, [])
  );
};

const addMessage = async ({ name, email, subject, message, createdAt }) => {
  if (await ensureDb()) {
    const db = getPool();
    await ensureMessagesBackfilledToDb(db);
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
    const ips = Object.keys(limits);
    const counts = ips.map((ip) => Number(limits[ip]?.count || 0));
    const windowStarts = ips.map((ip) => Number(limits[ip]?.windowStart || 0));
    const lastAttempts = ips.map((ip) => Number(limits[ip]?.lastAttempt || 0));

    await db.query("BEGIN");
    try {
      if (ips.length > 0) {
        await db.query(
          `
            INSERT INTO contact_rate_limits (ip, count, window_start, last_attempt)
            SELECT * FROM UNNEST($1::text[], $2::int[], $3::bigint[], $4::bigint[])
            ON CONFLICT (ip) DO UPDATE
            SET
              count = EXCLUDED.count,
              window_start = EXCLUDED.window_start,
              last_attempt = EXCLUDED.last_attempt
          `,
          [ips, counts, windowStarts, lastAttempts]
        );

        await db.query(
          "DELETE FROM contact_rate_limits WHERE ip <> ALL($1::text[])",
          [ips]
        );
      } else {
        await db.query("DELETE FROM contact_rate_limits");
      }

      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }

    return;
  }

  await writeJsonFile(contactRateLimitsPath, limits);
};

const getAuthAttempts = async () => {
  if (await ensureDb()) {
    const db = getPool();
    const result = await db.query("SELECT ip, count, first_attempt_at, last_attempt_at, locked_until FROM admin_auth_attempts");

    return result.rows.reduce((acc, row) => {
      acc[row.ip] = {
        count: Number(row.count),
        firstAttemptAt: Number(row.first_attempt_at),
        lastAttemptAt: Number(row.last_attempt_at),
        lockedUntil: Number(row.locked_until)
      };
      return acc;
    }, {});
  }

  return readJsonFile(adminAuthAttemptsPath, {});
};

const saveAuthAttempts = async (attempts) => {
  if (await ensureDb()) {
    const db = getPool();
    const ips = Object.keys(attempts);
    const counts = ips.map((ip) => Number(attempts[ip]?.count || 0));
    const firstAttempts = ips.map((ip) => Number(attempts[ip]?.firstAttemptAt || 0));
    const lastAttempts = ips.map((ip) => Number(attempts[ip]?.lastAttemptAt || 0));
    const lockedUntilValues = ips.map((ip) => Number(attempts[ip]?.lockedUntil || 0));

    await db.query("BEGIN");
    try {
      if (ips.length > 0) {
        await db.query(
          `
            INSERT INTO admin_auth_attempts (ip, count, first_attempt_at, last_attempt_at, locked_until)
            SELECT * FROM UNNEST($1::text[], $2::int[], $3::bigint[], $4::bigint[], $5::bigint[])
            ON CONFLICT (ip) DO UPDATE
            SET
              count = EXCLUDED.count,
              first_attempt_at = EXCLUDED.first_attempt_at,
              last_attempt_at = EXCLUDED.last_attempt_at,
              locked_until = EXCLUDED.locked_until
          `,
          [ips, counts, firstAttempts, lastAttempts, lockedUntilValues]
        );

        await db.query(
          "DELETE FROM admin_auth_attempts WHERE ip <> ALL($1::text[])",
          [ips]
        );
      } else {
        await db.query("DELETE FROM admin_auth_attempts");
      }

      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }

    return;
  }

  await writeJsonFile(adminAuthAttemptsPath, attempts);
};

const getNotificationQueue = async () => {
  if (await ensureDb()) {
    const db = getPool();
    const result = await db.query(
      "SELECT id, payload, attempts, next_attempt_at FROM notification_queue ORDER BY next_attempt_at ASC, id ASC"
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      payload: row.payload,
      attempts: Number(row.attempts),
      nextAttemptAt: Number(row.next_attempt_at)
    }));
  }

  return readJsonFile(notificationQueuePath, []);
};

const saveNotificationQueue = async (queue) => {
  if (await ensureDb()) {
    const db = getPool();
    const ids = queue.map((job) => Number(job.id));
    const payloads = queue.map((job) => JSON.stringify(job.payload || {}));
    const attempts = queue.map((job) => Number(job.attempts || 0));
    const nextAttempts = queue.map((job) => Number(job.nextAttemptAt || 0));

    await db.query("BEGIN");
    try {
      if (ids.length > 0) {
        await db.query(
          `
            INSERT INTO notification_queue (id, payload, attempts, next_attempt_at)
            SELECT * FROM UNNEST($1::bigint[], $2::jsonb[], $3::int[], $4::bigint[])
            ON CONFLICT (id) DO UPDATE
            SET
              payload = EXCLUDED.payload,
              attempts = EXCLUDED.attempts,
              next_attempt_at = EXCLUDED.next_attempt_at
          `,
          [ids, payloads, attempts, nextAttempts]
        );

        await db.query(
          "DELETE FROM notification_queue WHERE id <> ALL($1::bigint[])",
          [ids]
        );
      } else {
        await db.query("DELETE FROM notification_queue");
      }

      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }

    return;
  }

  await writeJsonFile(notificationQueuePath, queue);
};

const appendTelemetryEvent = async (eventPayload) => {
  if (await ensureDb()) {
    const db = getPool();
    await db.query(
      `
        INSERT INTO telemetry_events (event, path, locale, timestamp)
        VALUES ($1, $2, $3, $4)
      `,
      [
        String(eventPayload.event || "pageview"),
        String(eventPayload.path || "/"),
        String(eventPayload.locale || "en"),
        eventPayload.timestamp || new Date().toISOString()
      ]
    );

    // Keep only the newest telemetry rows to avoid unbounded growth in DB mode.
    await db.query(
      `
        DELETE FROM telemetry_events
        WHERE id IN (
          SELECT id
          FROM telemetry_events
          ORDER BY timestamp DESC, id DESC
          OFFSET $1
        )
      `,
      [TELEMETRY_RETENTION_LIMIT]
    );

    return;
  }

  let events = await readJsonFile(telemetryPath, []);
  events.push(eventPayload);
  if (events.length > TELEMETRY_RETENTION_LIMIT) {
    events = events.slice(events.length - TELEMETRY_RETENTION_LIMIT);
  }
  await writeJsonFile(telemetryPath, events);
};

const getTelemetryEvents = async (limit = 100) => {
  const parsedLimit = Number.isFinite(Number(limit)) ? Number(limit) : 100;
  const safeLimit = Math.min(Math.max(Math.trunc(parsedLimit), 1), 500);

  if (await ensureDb()) {
    const db = getPool();
    const result = await db.query(
      `
        SELECT event, path, locale, timestamp
        FROM telemetry_events
        ORDER BY timestamp DESC, id DESC
        LIMIT $1
      `,
      [safeLimit]
    );

    return result.rows.map((row) => ({
      event: String(row.event || "pageview"),
      path: String(row.path || "/"),
      locale: String(row.locale || "en"),
      timestamp: new Date(row.timestamp).toISOString()
    }));
  }

  const events = await readJsonFile(telemetryPath, []);
  if (!Array.isArray(events)) {
    return [];
  }

  return events
    .slice(-safeLimit)
    .reverse()
    .map((entry) => ({
      event: String(entry?.event || "pageview"),
      path: String(entry?.path || "/"),
      locale: String(entry?.locale || "en"),
      timestamp: String(entry?.timestamp || new Date().toISOString())
    }));
};

const getSystemMetrics = async () => {
  const [messages, rateLimits, authAttempts, queue] = await Promise.all([
    getMessages(),
    getRateLimits(),
    getAuthAttempts(),
    getNotificationQueue()
  ]);

  const activeRateLimits = Object.keys(rateLimits).length;
  const lockedAuthIps = Object.values(authAttempts).filter((entry) => Number(entry.lockedUntil || 0) > Date.now()).length;

  return {
    messageCount: messages.length,
    activeRateLimits,
    lockedAuthIps,
    queueDepth: queue.length
  };
};

const getStorageStatus = async () => {
  const status = {
    mode: shouldUseDatabase ? "database" : "json",
    dataDir,
    dbConfigured: shouldUseDatabase,
    dbReady: false,
    messageBackfillDone
  };

  if (!shouldUseDatabase) {
    return status;
  }

  try {
    const dbReady = await ensureDb();
    status.dbReady = dbReady;
    status.messageBackfillDone = messageBackfillDone;
    return status;
  } catch (error) {
    status.dbReady = false;
    status.error = error?.message || "Database unavailable";
    return status;
  }
};

module.exports = {
  getMessages,
  addMessage,
  getRateLimits,
  saveRateLimits,
  getAuthAttempts,
  saveAuthAttempts,
  getNotificationQueue,
  saveNotificationQueue,
  appendTelemetryEvent,
  getTelemetryEvents,
  getSystemMetrics,
  getStorageStatus
};
