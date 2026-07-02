const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("fs");
const path = require("path");
const os = require("os");

const testDataDir = path.join(os.tmpdir(), "portfolio-node-test-data");
process.env.NODE_ENV = "test";
process.env.PORTFOLIO_DATA_DIR = testDataDir;

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

test("POST /api/telemetry accepts event payload", async () => {
  const response = await request(app).post("/api/telemetry").send({
    event: "pageview",
    path: "/index.html",
    locale: "en"
  });

  assert.equal(response.status, 202);
  assert.equal(response.body.success, true);
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

  const summaryResponse = await request(app)
    .get("/api/admin/report-summary?engine=js")
    .set("Cookie", cookie);

  assert.equal(summaryResponse.status, 200);
  assert.equal(summaryResponse.body.success, true);
  assert.equal(summaryResponse.body.summary.engine, "js");
  assert.ok(Number.isFinite(summaryResponse.body.summary.totalMessages));
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
