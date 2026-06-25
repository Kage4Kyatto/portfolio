const { defineConfig, devices } = require("@playwright/test");
const path = require("path");

const e2eDataDir = path.join(__dirname, ".tmp", "playwright-data");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm start",
    url: "http://localhost:3000",
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORTFOLIO_DATA_DIR: e2eDataDir
    },
    reuseExistingServer: true,
    timeout: 120000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
