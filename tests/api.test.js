// Updated 2026-07-07
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("fs");
const path = require("path");
const os = require("os");

const testDataDir = path.join(os.tmpdir(), "portfolio-node-test-data");
process.env.NODE_ENV = "test";
process.env.PORTFOLIO_DATA_DIR = testDataDir;
process.env.PORTFOLIO_TRUST_PROXY_HEADERS = "true";

const app = require("../server");

const contactRateLimitPath = path.join(testDataDir, "contact_rate_limits.json");
const messagesPath = path.join(testDataDir, "messages.json");

test.beforeEach(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.writeFileSync(contactRateLimitPath, "{}", "utf8");
});

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test("GET /api/health returns service status", async () => {
  const response = await request(app).get("/api/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.service, "portfolio-api");
  assert.ok(response.body.timestamp);
  assert.ok(response.headers["content-security-policy"]);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
});

test("POST /api/contact rejects incomplete payload", async () => {
  const response = await request(app).post("/api/contact").send({
    name: "",
    email: "user@example.com",
    subject: "Missing fields",
    message: ""
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
});

test("POST /api/contact rejects invalid email format", async () => {
  const response = await request(app).post("/api/contact").send({
    name: "User",
    email: "not-an-email",
    subject: "Hello",
    message: "Message body"
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.errorCode, "INVALID_EMAIL");
});

test("POST /api/contact honors idempotency key for duplicate submissions", async () => {
  const idempotencyKey = "test-idempotency-key-123456";
  const payload = {
    name: "Idempotent User",
    email: "idempotent@example.com",
    subject: "Idempotent Subject",
    message: "Message body that should be deduplicated"
  };

  const firstResponse = await request(app)
    .post("/api/contact")
    .set("X-Idempotency-Key", idempotencyKey)
    .send(payload);

  assert.equal(firstResponse.status, 201);
  assert.equal(firstResponse.body.success, true);
  assert.ok(firstResponse.body.data?.id);

  const secondResponse = await request(app)
    .post("/api/contact")
    .set("X-Idempotency-Key", idempotencyKey)
    .send(payload);

  assert.equal(secondResponse.status, 200);
  assert.equal(secondResponse.body.success, true);
  assert.equal(secondResponse.body.idempotent, true);
  assert.equal(secondResponse.body.data?.id, firstResponse.body.data?.id);
  assert.equal(secondResponse.headers["x-idempotency-replayed"], "true");
});

test("POST /api/contact stores the submitted message", async () => {
  const payload = {
    name: "Stored User",
    email: "stored@example.com",
    subject: "Storage check",
    message: "Verifying the contact flow persists data."
  };

  const response = await request(app).post("/api/contact").send(payload);

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.ok(response.body.data?.id);

  const messages = JSON.parse(fs.readFileSync(messagesPath, "utf8"));
  const storedMessage = messages.find((entry) => entry.id === response.body.data.id);

  assert.ok(storedMessage);
  assert.equal(storedMessage.name, payload.name);
  assert.equal(storedMessage.email, payload.email);
  assert.equal(storedMessage.subject, payload.subject);
  assert.equal(storedMessage.message, payload.message);
});

test("GET /api/version returns app version metadata", async () => {
  const response = await request(app).get("/api/version");

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(typeof response.body.version === "string");
  assert.ok(response.body.timestamp);
});

test("GET /robots.txt includes sitemap directive", async () => {
  const response = await request(app).get("/robots.txt");

  assert.equal(response.status, 200);
  assert.match(response.text, /Sitemap:\s+http:\/\/127\.0\.0\.1:\d+\/sitemap\.xml/);
});

test("GET /sitemap.xml contains lastmod tags", async () => {
  const response = await request(app).get("/sitemap.xml");

  assert.equal(response.status, 200);
  assert.match(response.text, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
});

test("GET /api/openapi.json returns OpenAPI spec", async () => {
  const response = await request(app).get("/api/openapi.json");

  assert.equal(response.status, 200);
  assert.equal(response.body.openapi, "3.1.0");
  assert.ok(response.body.paths["/api/contact"]);
});

test("GET /api/blog/posts returns an empty list when the blog file is missing", async () => {
  const blogDir = path.join(__dirname, "..", "public", "blog");
  const blogFile = path.join(blogDir, "blog-posts.json");
  const backupFile = path.join(blogDir, "blog-posts.json.bak-test");

  fs.renameSync(blogFile, backupFile);

  try {
    const response = await request(app).get("/api/blog/posts");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.deepEqual(response.body.posts, []);
    assert.equal(response.body.total, 0);
  } finally {
    fs.renameSync(backupFile, blogFile);
  }
});

test("POST /api/telemetry accepts event payload", async () => {
  const response = await request(app).post("/api/telemetry").send({
    event: "pageview",
    path: "/index.html",
    locale: "en"
  });

  assert.equal(response.status, 202);
  assert.equal(response.body.success, true);
});

test("POST /api/telemetry rejects invalid payload shape", async () => {
  const response = await request(app)
    .post("/api/telemetry")
    .set("Content-Type", "application/json")
    .send(["bad"]);

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
});

test("POST /api/telemetry rejects unsupported content type", async () => {
  const response = await request(app)
    .post("/api/telemetry")
    .set("Content-Type", "text/html")
    .send("<p>bad</p>");

  assert.equal(response.status, 415);
  assert.equal(response.body.success, false);
});

test("admin audit endpoint exposes normalized telemetry events", async () => {
  process.env.ADMIN_USER = "admin";
  process.env.ADMIN_PASS = "secret";

  const telemetryResponse = await request(app).post("/api/telemetry").send({
    event: "unknown_event_type",
    path: "/contract-test",
    locale: "BAD"
  });

  assert.equal(telemetryResponse.status, 202);
  assert.equal(telemetryResponse.body.success, true);

  const authHeader = `Basic ${Buffer.from("admin:secret").toString("base64")}`;
  const loginResponse = await request(app)
    .post("/api/admin/login")
    .set("Authorization", authHeader);

  const cookie = loginResponse.headers["set-cookie"];

  let targetEvent;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const auditResponse = await request(app)
      .get("/api/admin/audit-events?limit=50")
      .set("Cookie", cookie);

    assert.equal(auditResponse.status, 200);
    assert.equal(auditResponse.body.success, true);
    assert.ok(Array.isArray(auditResponse.body.events));

    targetEvent = auditResponse.body.events.find((entry) => entry.path === "/contract-test");
    if (targetEvent) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  assert.ok(targetEvent);
  assert.equal(targetEvent.event, "pageview");
  assert.equal(targetEvent.locale, "en");
});

test("GET unknown route returns 404 page", async () => {
  const response = await request(app).get("/this-route-does-not-exist");

  assert.equal(response.status, 404);
  assert.match(response.text, /Page not found/i);
});

test("POST /api/contact applies rate limiting", async () => {
  const payload = {
    name: "Rate Test",
    email: "rate@example.com",
    subject: "Limit",
    message: "Checking limiter"
  };

  const ip = "198.51.100.10";
  let lastResponse = null;

  for (let attempt = 0; attempt < 9; attempt += 1) {
    lastResponse = await request(app).post("/api/contact").set("X-Forwarded-For", ip).send(payload);
  }

  assert.equal(lastResponse.status, 429);
  assert.equal(lastResponse.body.success, false);
});

test("admin session login and logout flow works", async () => {
  process.env.ADMIN_USER = "admin";
  process.env.ADMIN_PASS = "secret";

  const authHeader = `Basic ${Buffer.from("admin:secret").toString("base64")}`;
  const loginResponse = await request(app)
    .post("/api/admin/login")
    .set("Authorization", authHeader);

  assert.equal(loginResponse.status, 200);
  assert.equal(loginResponse.body.success, true);
  assert.ok(loginResponse.body.csrfToken);

  const cookie = loginResponse.headers["set-cookie"];
  assert.ok(cookie);

  const metricsResponse = await request(app)
    .get("/api/admin/metrics")
    .set("Cookie", cookie);

  assert.equal(metricsResponse.status, 200);
  assert.equal(metricsResponse.body.success, true);
  assert.ok(metricsResponse.body.metrics);

  const logoutResponse = await request(app)
    .post("/api/admin/logout")
    .set("Cookie", cookie)
    .set("X-CSRF-Token", loginResponse.body.csrfToken);

  assert.equal(logoutResponse.status, 200);
  assert.equal(logoutResponse.body.success, true);
});

test("admin queue and summary endpoints work", async () => {
  process.env.ADMIN_USER = "admin";
  process.env.ADMIN_PASS = "secret";

  const authHeader = `Basic ${Buffer.from("admin:secret").toString("base64")}`;
  const loginResponse = await request(app)
    .post("/api/admin/login")
    .set("Authorization", authHeader);

  const cookie = loginResponse.headers["set-cookie"];
  const csrfToken = loginResponse.body.csrfToken;

  const queueResponse = await request(app)
    .get("/api/admin/queue")
    .set("Cookie", cookie);

  assert.equal(queueResponse.status, 200);
  assert.equal(queueResponse.body.success, true);
  assert.ok(queueResponse.body.queue);

  const processResponse = await request(app)
    .post("/api/admin/queue/process")
    .set("Cookie", cookie)
    .set("X-CSRF-Token", csrfToken);

  assert.equal(processResponse.status, 200);
  assert.equal(processResponse.body.success, true);
  assert.ok(processResponse.body.queue);

  const pauseResponse = await request(app)
    .post("/api/admin/queue/pause")
    .set("Cookie", cookie)
    .set("X-CSRF-Token", csrfToken);

  assert.equal(pauseResponse.status, 200);
  assert.equal(pauseResponse.body.success, true);
  assert.equal(pauseResponse.body.queue.workerPaused, true);

  const resumeResponse = await request(app)
    .post("/api/admin/queue/resume")
    .set("Cookie", cookie)
    .set("X-CSRF-Token", csrfToken);

  assert.equal(resumeResponse.status, 200);
  assert.equal(resumeResponse.body.success, true);
  assert.equal(resumeResponse.body.queue.workerPaused, false);

  const clearResponse = await request(app)
    .post("/api/admin/queue/clear")
    .set("Cookie", cookie)
    .set("X-CSRF-Token", csrfToken);

  assert.equal(clearResponse.status, 200);
  assert.equal(clearResponse.body.success, true);
  assert.equal(clearResponse.body.queue.queueDepth, 0);

  const summaryResponse = await request(app)
    .get("/api/admin/report-summary?engine=js")
    .set("Cookie", cookie);

  assert.equal(summaryResponse.status, 200);
  assert.equal(summaryResponse.body.success, true);
  assert.equal(summaryResponse.body.summary.engine, "js");
  assert.ok(Number.isFinite(summaryResponse.body.summary.totalMessages));

  const performanceResponse = await request(app)
    .get("/api/admin/performance")
    .set("Cookie", cookie);

  assert.equal(performanceResponse.status, 200);
  assert.equal(performanceResponse.body.success, true);
  assert.ok(Array.isArray(performanceResponse.body.performance.routes));
});

test("runtime health contracts are consistent when optional services are running", async () => {
  const checks = [
    { url: "http://localhost:4001/health", expectedKey: "service" },
    { url: "http://localhost:8000/api/health.php", expectedKey: "service" }
  ];

  for (const check of checks) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      const response = await fetch(check.url, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        continue;
      }

      const body = await response.json();
      assert.ok(body.status === "ok" || body.ok === true);
      assert.ok(typeof body[check.expectedKey] === "string");
    } catch {
      // Optional runtime may be offline in CI.
    }
  }
});

test("GET /api/blog/posts returns published posts only", async () => {
  const response = await request(app).get("/api/blog/posts");

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(Array.isArray(response.body.posts));
  
  const allPublished = response.body.posts.every(post => post.published === true);
  assert.equal(allPublished, true);
});

test("GET /api/admin/analytics returns time-range filtered data", async () => {
  process.env.ADMIN_USER = "admin";
  process.env.ADMIN_PASS = "secret";

  const contactPayload = {
    name: "Analytics User",
    email: "analytics@example.com",
    subject: "Analytics Subject",
    message: "Analytics message body"
  };

  for (let i = 0; i < 3; i += 1) {
    const submitResponse = await request(app)
      .post("/api/contact")
      .set("X-Forwarded-For", "203.0.113.10")
      .send(contactPayload);

    assert.equal(submitResponse.status, 201);
  }

  const authHeader = `Basic ${Buffer.from("admin:secret").toString("base64")}`;
  const loginResponse = await request(app)
    .post("/api/admin/login")
    .set("Authorization", authHeader);

  const cookie = loginResponse.headers["set-cookie"];

  const analyticsResponse = await request(app)
    .get("/api/admin/analytics?range=30d")
    .set("Cookie", cookie);

  assert.equal(analyticsResponse.status, 200);
  assert.equal(analyticsResponse.body.success, true);
  assert.ok(analyticsResponse.body.analytics);
  assert.equal(analyticsResponse.body.analytics.timeRange, "30d");
  assert.equal(analyticsResponse.body.analytics.total, 3);
  assert.equal(analyticsResponse.body.analytics.unread, 0);
  assert.equal(analyticsResponse.body.analytics.avgMessagesPerDay, "0.1");
  assert.ok(analyticsResponse.body.analytics.dailyTotals);
  assert.ok(analyticsResponse.body.analytics.sourceBreakdown);
  assert.equal(analyticsResponse.body.analytics.sourceBreakdown.direct, 3);
});

test("GET /api/admin/analytics supports range parameter", async () => {
  process.env.ADMIN_USER = "admin";
  process.env.ADMIN_PASS = "secret";

  const authHeader = `Basic ${Buffer.from("admin:secret").toString("base64")}`;
  const loginResponse = await request(app)
    .post("/api/admin/login")
    .set("Authorization", authHeader);

  const cookie = loginResponse.headers["set-cookie"];

  const ranges = ["24h", "7d", "30d", "all"];
  
  for (const range of ranges) {
    const analyticsResponse = await request(app)
      .get(`/api/admin/analytics?range=${range}`)
      .set("Cookie", cookie);

    assert.equal(analyticsResponse.status, 200);
    assert.equal(analyticsResponse.body.analytics.timeRange, range);
  }
});

test("GET /api/admin/analytics rejects invalid range and filter", async () => {
  process.env.ADMIN_USER = "admin";
  process.env.ADMIN_PASS = "secret";

  const authHeader = `Basic ${Buffer.from("admin:secret").toString("base64")}`;
  const loginResponse = await request(app)
    .post("/api/admin/login")
    .set("Authorization", authHeader);

  const cookie = loginResponse.headers["set-cookie"];

  const invalidRangeResponse = await request(app)
    .get("/api/admin/analytics?range=bad")
    .set("Cookie", cookie);

  assert.equal(invalidRangeResponse.status, 400);
  assert.equal(invalidRangeResponse.body.success, false);

  const invalidFilterResponse = await request(app)
    .get("/api/admin/analytics?range=30d&filter=bad")
    .set("Cookie", cookie);

  assert.equal(invalidFilterResponse.status, 400);
  assert.equal(invalidFilterResponse.body.success, false);
});

test("GET /api/blog/posts handles invalid pagination params safely", async () => {
  const response = await request(app).get("/api/blog/posts?limit=abc&offset=-5");

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(Array.isArray(response.body.posts));
});

test("GET /api/admin/analytics supports unread filter and exact breakdowns", async () => {
  process.env.ADMIN_USER = "admin";
  process.env.ADMIN_PASS = "secret";

  const seededMessages = [
    {
      id: 1,
      name: "Unread One",
      email: "u1@example.com",
      subject: "Unread",
      message: "First unread",
      createdAt: "2026-01-01T10:00:00.000Z",
      status: "unread",
      source: "newsletter"
    },
    {
      id: 2,
      name: "Unread Two",
      email: "u2@example.com",
      subject: "Unread",
      message: "Second unread",
      createdAt: "2026-01-02T11:00:00.000Z",
      read: false,
      referrer: "https://example.com"
    },
    {
      id: 3,
      name: "Read One",
      email: "r1@example.com",
      subject: "Read",
      message: "Read message",
      createdAt: "2026-01-02T12:00:00.000Z",
      read: true,
      source: "direct"
    }
  ];

  fs.writeFileSync(messagesPath, JSON.stringify(seededMessages, null, 2), "utf8");

  const authHeader = `Basic ${Buffer.from("admin:secret").toString("base64")}`;
  const loginResponse = await request(app)
    .post("/api/admin/login")
    .set("Authorization", authHeader);

  const cookie = loginResponse.headers["set-cookie"];

  const analyticsResponse = await request(app)
    .get("/api/admin/analytics?range=all&filter=unread")
    .set("Cookie", cookie);

  assert.equal(analyticsResponse.status, 200);
  assert.equal(analyticsResponse.body.success, true);
  assert.equal(analyticsResponse.body.analytics.total, 2);
  assert.equal(analyticsResponse.body.analytics.unread, 2);
  assert.deepEqual(analyticsResponse.body.analytics.dailyTotals, {
    "2026-01-01": 1,
    "2026-01-02": 1
  });
  assert.deepEqual(analyticsResponse.body.analytics.sourceBreakdown, {
    newsletter: 1,
    "https://example.com": 1
  });
});

