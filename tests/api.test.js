const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../server");

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
