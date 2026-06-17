const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("fs");
const path = require("path");

const app = require("../server");

const contactRateLimitPath = path.join(__dirname, "..", "backend", "php", "data", "contact_rate_limits.json");

test.beforeEach(() => {
  fs.writeFileSync(contactRateLimitPath, "{}", "utf8");
});

test("GET /api/health returns service status", async () => {
  const response = await request(app).get("/api/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.service, "portfolio-api");
  assert.ok(response.body.timestamp);
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
