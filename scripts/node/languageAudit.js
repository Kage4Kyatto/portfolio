const { chromium } = require("playwright");

const base = "http://localhost:3000";
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
    return false;
  }

  await page.selectOption(".lang-toggle__select", locale);
  return true;
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const failures = [];
  const skipped = [];

  for (const route of pages) {
    await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });

    const hasToggle = (await page.locator(".lang-toggle__select").count()) > 0;
    if (!hasToggle) {
      skipped.push(route);
      continue;
    }

    const keys = await page.$$eval("[data-i18n]", (elements) => {
      const unique = Array.from(
        new Set(elements.map((element) => element.getAttribute("data-i18n")).filter(Boolean))
      );
      return unique.slice(0, 10);
    });

    for (const locale of locales) {
      const matched = await selectLocale(page, locale);
      if (!matched) {
        failures.push({ route, locale, reason: "menu-option-not-found" });
        continue;
      }

      await page.waitForTimeout(900);

      const result = await page.evaluate(async ({ locale, keys }) => {
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

      if (normalize(result.lang) !== locale) {
        failures.push({ route, locale, reason: `lang-attribute-mismatch:${result.lang}` });
      }

      if (result.mismatches.length > 0) {
        failures.push({ route, locale, reason: "dictionary-mismatch", samples: result.mismatches });
      }
    }
  }

  await browser.close();

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
