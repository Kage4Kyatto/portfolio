const { test, expect } = require("@playwright/test");

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
