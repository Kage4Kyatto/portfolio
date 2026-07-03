const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const ADMIN_TEST_USER = process.env.ADMIN_USER || "e2e-admin";
const ADMIN_TEST_PASS = process.env.ADMIN_PASS || "e2e-password";
const LOCALE_LABELS = {
  en: "English",
  nl: "Nederlands",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  pt: "Português"
};

const selectLocale = async (page, locale) => {
  await page.locator(".site-header").hover();
  await page.locator(".lang-toggle__button").click();
  await page.locator(`.lang-toggle__option[data-locale="${locale}"]`).click();
};

test("home page loads and nav works", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page).toHaveTitle(/Portfolio/i);
  await expect(page.locator("main")).toBeVisible();
});

test("language toggle changes locale label", async ({ page }) => {
  await page.goto("/index.html");

  const selector = page.locator(".lang-toggle__button");
  await expect(selector).toHaveText(LOCALE_LABELS.en);
  await selectLocale(page, "nl");
  await expect(selector).toHaveText(LOCALE_LABELS.nl);
});

test("language toggle remains stable after rapid repeated clicks", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("portfolio.locale", "en");
  });

  await page.goto("/index.html");

  const selector = page.locator(".lang-toggle__button");
  await expect(selector).toHaveText(LOCALE_LABELS.en);

  await selectLocale(page, "nl");
  await expect(selector).toHaveText(LOCALE_LABELS.nl);

  await selectLocale(page, "de");
  await expect(selector).toHaveText(LOCALE_LABELS.de);

  await selectLocale(page, "en");
  await expect(selector).toHaveText(LOCALE_LABELS.en);
});

test("language toggle is hidden during splash and visible after", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/index.html");

  const immediateState = await page.evaluate(() => {
    const splash = document.querySelector(".home-splash");
    const lang = document.querySelector(".lang-toggle");
    const splashStyle = getComputedStyle(splash);
    const langStyle = getComputedStyle(lang);
    return {
      splashVisibility: splashStyle.visibility,
      splashOpacity: splashStyle.opacity,
      langVisibility: langStyle.visibility,
      langOpacity: langStyle.opacity,
      langPointerEvents: langStyle.pointerEvents
    };
  });

  expect(immediateState.splashVisibility).toBe("visible");
  expect(immediateState.langVisibility).toBe("hidden");
  expect(immediateState.langPointerEvents).toBe("none");

  await page.waitForTimeout(4300);

  const afterSplashState = await page.evaluate(() => {
    const lang = document.querySelector(".lang-toggle");
    const langStyle = getComputedStyle(lang);
    return {
      langVisibility: langStyle.visibility,
      langOpacity: langStyle.opacity,
      langPointerEvents: langStyle.pointerEvents
    };
  });

  expect(afterSplashState.langVisibility).toBe("visible");
  expect(afterSplashState.langPointerEvents).toBe("auto");
});

test("desktop header keeps language visible while links stay hidden at rest", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/index.html");
  await page.mouse.move(1000, 500);
  await page.waitForTimeout(4300);

  const restState = await page.evaluate(() => {
    const langItem = document.querySelector(".lang-toggle");
    const aboutItem = document.querySelector('.nav-links a[href="/about.html"]')?.closest("li");
    const langStyle = getComputedStyle(langItem);
    const aboutStyle = getComputedStyle(aboutItem);
    return {
      langVisibility: langStyle.visibility,
      langOpacity: langStyle.opacity,
      langPointerEvents: langStyle.pointerEvents,
      aboutVisibility: aboutStyle.visibility,
      aboutOpacity: aboutStyle.opacity,
      aboutPointerEvents: aboutStyle.pointerEvents
    };
  });

  expect(restState.langVisibility).toBe("visible");
  expect(restState.langPointerEvents).toBe("auto");
  expect(restState.aboutVisibility).toBe("hidden");
  expect(restState.aboutOpacity).toBe("0");
  expect(restState.aboutPointerEvents).toBe("none");
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
