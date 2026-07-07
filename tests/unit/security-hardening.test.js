// Updated 2026-07-07
const test = require("node:test");
const assert = require("node:assert/strict");

const getClientIp = require("../../backend/node/utils/getClientIp");
const { requireCloudflareAccess } = require("../../backend/node/middleware/cloudflareAccessMiddleware");

const trackedEnvKeys = [
  "PORTFOLIO_TRUST_PROXY_HEADERS",
  "CF_ACCESS_ENABLED",
  "CF_ACCESS_ALLOWED_EMAILS",
  "CF_ACCESS_ALLOW_LOCAL_BYPASS",
  "NODE_ENV"
];

const originalEnv = trackedEnvKeys.reduce((acc, key) => {
  acc[key] = process.env[key];
  return acc;
}, {});

const restoreTrackedEnv = () => {
  trackedEnvKeys.forEach((key) => {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
      return;
    }

    process.env[key] = originalEnv[key];
  });
};

const createMockResponse = () => {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    }
  };
};

test.afterEach(() => {
  restoreTrackedEnv();
});

test("getClientIp ignores spoofed forwarded headers by default", () => {
  delete process.env.PORTFOLIO_TRUST_PROXY_HEADERS;

  const ip = getClientIp({
    headers: {
      "x-forwarded-for": "203.0.113.10",
      "x-real-ip": "203.0.113.11"
    },
    ip: "",
    socket: {
      remoteAddress: "::ffff:127.0.0.1"
    }
  });

  assert.equal(ip, "127.0.0.1");
});

test("getClientIp trusts forwarded headers only when explicitly enabled", () => {
  process.env.PORTFOLIO_TRUST_PROXY_HEADERS = "true";

  const ip = getClientIp({
    headers: {
      "x-forwarded-for": "198.51.100.42, 10.0.0.1"
    },
    ip: "",
    socket: {
      remoteAddress: "::ffff:127.0.0.1"
    }
  });

  assert.equal(ip, "198.51.100.42");
});

test("getClientIp falls back to unknown when no address is available", () => {
  delete process.env.PORTFOLIO_TRUST_PROXY_HEADERS;

  const ip = getClientIp({
    headers: {},
    ip: "",
    socket: {},
    connection: {}
  });

  assert.equal(ip, "unknown");
});

test("cloudflare middleware does not bypass auth based on Host header", () => {
  process.env.NODE_ENV = "test";
  process.env.CF_ACCESS_ENABLED = "true";
  process.env.CF_ACCESS_ALLOW_LOCAL_BYPASS = "true";

  const req = {
    headers: {
      host: "localhost"
    },
    socket: {
      remoteAddress: "203.0.113.44"
    },
    connection: {
      remoteAddress: "203.0.113.44"
    }
  };
  const res = createMockResponse();
  let calledNext = false;

  requireCloudflareAccess(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.success, false);
});

test("cloudflare middleware local bypass works for loopback source in non-production", () => {
  process.env.NODE_ENV = "development";
  process.env.CF_ACCESS_ENABLED = "true";
  process.env.CF_ACCESS_ALLOW_LOCAL_BYPASS = "true";

  const req = {
    headers: {},
    socket: {
      remoteAddress: "::1"
    },
    connection: {
      remoteAddress: "::1"
    }
  };
  const res = createMockResponse();
  let calledNext = false;

  requireCloudflareAccess(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
  assert.equal(res.statusCode, null);
});
