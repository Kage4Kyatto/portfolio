const { test, expect } = require("@playwright/test");

test("home page loads and nav works", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page).toHaveTitle(/Portfolio/i);
  await expect(page.locator("main")).toBeVisible();
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
