const { chromium } = require("playwright");

const base = process.env.PORTFOLIO_AUDIT_BASE_URL || "http://localhost:3000";
const pages = [
  "/index.html",
  "/about.html",
  "/projects.html",
  "/services.html",
  "/contact.html",
  "/admin.html",
  "/my-page.html",
  "/privacy.html",
  "/updates.html",
  "/project-portfolio-platform.html",
  "/project-testing-assignment.html",
  "/404.html",
  "/500.html",
  "/blog/index.html"
];
const locales = ["en", "nl", "de", "fr", "es", "pt"];

const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();

const selectLocale = async (page, locale) => {
  const selector = page.locator(".lang-toggle__select");
  const exists = (await selector.count()) > 0;
  if (!exists) {
    return { matched: false, reason: "menu-option-not-found" };
  }

  // Header links are hidden at rest on desktop. Hover ensures the select can be interacted with.
  await page.locator(".site-header").hover().catch(() => {});

  try {
    await page.selectOption(".lang-toggle__select", locale, { timeout: 5000 });
    return { matched: true };
  } catch {
    return { matched: false, reason: "menu-option-not-interactable" };
  }
};

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    console.log("LANG_AUDIT_FAIL");
    console.log(JSON.stringify([{ route: "n/a", locale: "n/a", reason: "browser-launch-failed" }], null, 2));
    process.exit(1);
  }

  const failures = [];
  const skipped = [];

  for (const route of pages) {
    let page;
    try {
      page = await browser.newPage();
    } catch {
      failures.push({ route, locale: "n/a", reason: "browser-page-create-failed" });
      break;
    }

    try {
      await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
    } catch {
      failures.push({ route, locale: "n/a", reason: "page-load-failed" });
      await page.close();
      continue;
    }

    const hasToggle = (await page.locator(".lang-toggle__select").count()) > 0;
    if (!hasToggle) {
      skipped.push(route);
      await page.close();
      continue;
    }

    const keys = await page.$$eval("[data-i18n]", (elements) => {
      const unique = Array.from(
        new Set(elements.map((element) => element.getAttribute("data-i18n")).filter(Boolean))
      );
      return unique.slice(0, 10);
    });

    for (const locale of locales) {
      if (page.isClosed()) {
        failures.push({ route, locale, reason: "page-closed-before-locale-check" });
        break;
      }

      const matched = await selectLocale(page, locale);
      if (!matched.matched) {
        failures.push({ route, locale, reason: matched.reason || "menu-option-not-found" });
        continue;
      }

      try {
        await page.waitForTimeout(900);
      } catch {
        failures.push({ route, locale, reason: "page-closed-during-wait" });
        break;
      }

      let result;
      try {
        result = await page.evaluate(async ({ locale, keys }) => {
        const normalizeInner = (value) => String(value || "").replace(/\s+/g, " ").trim();
        const htmlToText = (raw) => {
          const element = document.createElement("div");
          element.innerHTML = String(raw || "");
          return normalizeInner(element.textContent || "");
        };

        const lang = document.documentElement.lang;

        const response = await fetch(`/assets/i18n/${locale}.json`, { cache: "no-store" });
        const dictionary = response.ok ? await response.json() : {};

        const mismatches = [];

        for (const key of keys) {
          if (!(key in dictionary)) {
            continue;
          }

          const expectedRaw = dictionary[key];
          if (typeof expectedRaw !== "string") {
            continue;
          }

          if (expectedRaw.includes("<")) {
            continue;
          }

          const element = document.querySelector(`[data-i18n="${key}"]`);
          if (!element) {
            continue;
          }

          const expected = htmlToText(expectedRaw);
          const actual = normalizeInner(element.textContent || "");

          if (expected && actual !== expected) {
            mismatches.push({ key, expected, actual });
            if (mismatches.length >= 3) {
              break;
            }
          }
        }

        return { lang, mismatches };
      }, { locale, keys });
      } catch {
        failures.push({ route, locale, reason: "page-closed-during-evaluate" });
        break;
      }

      if (normalize(result.lang) !== locale) {
        failures.push({ route, locale, reason: `lang-attribute-mismatch:${result.lang}` });
      }

      if (result.mismatches.length > 0) {
        failures.push({ route, locale, reason: "dictionary-mismatch", samples: result.mismatches });
      }
    }

    await page.close();
  }

  if (browser && browser.isConnected()) {
    await browser.close();
  }

  console.log(`AUDIT_TOTAL_PAGES ${pages.length}`);
  console.log(`AUDIT_SKIPPED_NO_TOGGLE ${JSON.stringify(skipped)}`);

  if (failures.length === 0) {
    console.log("LANG_AUDIT_OK");
    process.exit(0);
  }

  console.log("LANG_AUDIT_FAIL");
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
})();
