const { defineConfig, devices } = require("@playwright/test");
const path = require("path");

const e2eDataDir = path.join(__dirname, ".tmp", "playwright-data");
const e2ePort = 4173;
const e2eBaseUrl = `http://localhost:${e2ePort}`;

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry"
  },
  webServer: {
    command: `set PORT=${e2ePort}&& npm start`,
    url: e2eBaseUrl,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORTFOLIO_DATA_DIR: e2eDataDir
    },
    reuseExistingServer: false,
    timeout: 120000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
