const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

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

  await page.locator("#admin-user").fill("e2e-admin");
  await page.locator("#admin-pass").fill("e2e-password");
  await page.getByRole("button", { name: /load messages/i }).click();

  await expect(page.locator("#messages-table")).toBeVisible();
  await expect(page.locator("#admin-notice")).toContainText(/loaded/i);

  await page.click("#tab-analytics");

  await page.getByRole("button", { name: /refresh queue/i }).click();
  await expect(page.locator("#queue-output")).not.toContainText("No queue data loaded yet.");

  await page.getByRole("button", { name: /pause worker/i }).click();
  await expect(page.locator("#queue-output")).toContainText(/workerPaused|paused/i);

  await page.getByRole("button", { name: /resume worker/i }).click();
  await expect(page.locator("#queue-output")).toContainText(/workerPaused|resumed/i);

  await page.getByRole("button", { name: /refresh audit events/i }).click();
  await expect(page.locator("#audit-output")).not.toContainText("No audit data loaded yet.");

  await expect(page.locator("#performance-output .audit-table")).toBeVisible();
  await page.getByRole("button", { name: /load summary/i }).click();
  await expect(page.locator("#summary-output")).toContainText(/runtimeStatus|storage/i);
});
