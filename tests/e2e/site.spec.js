const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const ADMIN_TEST_USER = process.env.ADMIN_USER || "e2e-admin";
const ADMIN_TEST_PASS = process.env.ADMIN_PASS || "e2e-password";

test("home page loads and nav works", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page).toHaveTitle(/Portfolio/i);
  await expect(page.locator("main")).toBeVisible();
});

test("language toggle changes locale label", async ({ page }) => {
  await page.goto("/index.html");

  const toggle = page.locator(".lang-toggle__button");
  await expect(toggle).toHaveText("EN");
  await toggle.click();
  await expect(toggle).toHaveText("NL");
});

test("language toggle remains stable after rapid repeated clicks", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("portfolio.locale", "en");
  });

  await page.goto("/index.html");

  const toggle = page.locator(".lang-toggle__button");
  await expect(toggle).toHaveText("EN");

  await page.evaluate(() => {
    const button = document.querySelector(".lang-toggle__button");
    for (let i = 0; i < 12; i += 1) {
      button.click();
    }
  });

  await expect.poll(async () => {
    const label = await toggle.innerText();
    const lang = await page.evaluate(() => document.documentElement.lang);
    return `${label}:${lang}`;
  }).toBe("EN:en");

  await toggle.click();
  await expect(toggle).toHaveText("NL");

  await toggle.click();
  await expect(toggle).toHaveText("DE");
});

test("404 route shows not found page", async ({ page }) => {
  await page.goto("/not-a-real-page");
  await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
});

test("contact form submits validation errors", async ({ page }) => {
  await page.goto("/contact.html");
  await page.getByRole("button", { name: /submit/i }).click();
  await expect(page.locator("#name")).toBeFocused();
});

test("contact form submits successfully", async ({ page }) => {
  await page.goto("/contact.html");
  await page.locator("#name").fill("Playwright User");
  await page.locator("#email").fill("playwright@example.com");
  await page.locator("#subject").fill("E2E smoke test");
  await page.locator("#message").fill("Testing the contact submit flow.");
  await page.getByRole("button", { name: /submit/i }).click();
  await expect(page.locator("#form-notice")).toContainText(/thanks|sent/i);
});

test("homepage has no serious accessibility violations", async ({ page }) => {
  await page.goto("/index.html");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});

test("admin dashboard loads queue, audit, and performance panels", async ({ page, request }) => {
  await request.post("/api/contact", {
    data: {
      name: "Admin E2E",
      email: "admin-e2e@example.com",
      subject: "Admin coverage",
      message: "Creates data for admin dashboard e2e coverage."
    }
  });

  await page.goto("/admin.html");

  await page.locator("#admin-user").fill(ADMIN_TEST_USER);
  await page.locator("#admin-pass").fill(ADMIN_TEST_PASS);
  await page.locator("#admin-auth-form button[type='submit']").click();

  await expect.poll(async () => {
    const className = await page.locator("#admin-notice").getAttribute("class");
    const text = await page.locator("#admin-notice").innerText();
    return `${className || ""}:${text}`;
  }, { timeout: 15000 }).toMatch(/notice success:(Loaded|Geladen)/i);

  await expect(page.locator("#messages-section")).toBeVisible();
  await expect(page.locator("#messages-table")).toBeVisible({ timeout: 15000 });

  await page.click("#tab-analytics");

  await page.locator("#queue-refresh").click();
  await expect(page.locator("#queue-output")).not.toContainText("No queue data loaded yet.");

  await page.locator("#queue-pause").click();
  await expect(page.locator("#queue-output")).toContainText(/workerPaused|paused/i);

  await page.locator("#queue-resume").click();
  await expect(page.locator("#queue-output")).toContainText(/workerPaused|resumed/i);

  await page.locator("#audit-refresh").click();
  await expect(page.locator("#audit-output")).not.toContainText("No audit data loaded yet.");

  await expect(page.locator("#performance-output .audit-table")).toBeVisible();
  await page.locator("#summary-load").click();
  await expect(page.locator("#summary-output")).toContainText(/runtimeStatus|storage/i);
});
