// Updated 2026-07-07
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

const projectRoot = path.join(__dirname, "..", "..");

const getAvailablePort = async () => {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = Number(address && address.port);
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
};

const startServer = async (env) => {
  const child = spawn("node", ["server.js"], {
    cwd: projectRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let startupOutput = "";

  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Server did not start in time. Output: ${startupOutput}`));
    }, 10000);

    const onData = (chunk) => {
      const text = String(chunk || "");
      startupOutput += text;
      if (text.includes("Portfolio server running on")) {
        clearTimeout(timeout);
        resolve();
      }
    };

    const onExit = (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before startup with code ${code}. Output: ${startupOutput}`));
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", onExit);
  });

  await ready;

  const stop = async () => {
    if (child.killed) {
      return;
    }

    await new Promise((resolve) => {
      const onExit = () => resolve();
      child.once("exit", onExit);
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 2000);
    });
  };

  return { child, stop };
};

test("production robots and sitemap use configured SITE_BASE_URL", async () => {
  const port = await getAvailablePort();
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    SITE_BASE_URL: "https://portfolio.example.com",
    ADMIN_USER: "admin",
    ADMIN_PASS: "secret",
    ADMIN_SESSION_SECRET: "test-production-session-secret"
  };

  const { stop } = await startServer(env);

  try {
    const robotsResponse = await fetch(`http://127.0.0.1:${port}/robots.txt`, {
      headers: {
        Host: "attacker.invalid"
      }
    });
    const robotsText = await robotsResponse.text();

    assert.equal(robotsResponse.status, 200);
    assert.match(robotsText, /Sitemap:\s+https:\/\/portfolio\.example\.com\/sitemap\.xml/);
    assert.doesNotMatch(robotsText, /attacker\.invalid/);

    const sitemapResponse = await fetch(`http://127.0.0.1:${port}/sitemap.xml`, {
      headers: {
        Host: "evil.invalid"
      }
    });
    const sitemapText = await sitemapResponse.text();

    assert.equal(sitemapResponse.status, 200);
    assert.match(sitemapText, /<loc>https:\/\/portfolio\.example\.com\/index\.html<\/loc>/);
    assert.doesNotMatch(sitemapText, /evil\.invalid/);
  } finally {
    await stop();
  }
});
