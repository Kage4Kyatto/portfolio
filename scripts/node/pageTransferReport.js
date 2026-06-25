const { chromium } = require("@playwright/test");

const ORIGIN = process.env.PAGE_REPORT_ORIGIN || "http://localhost:3000";
const PAGES = [
  "/index.html",
  "/about.html",
  "/projects.html",
  "/services.html",
  "/contact.html",
  "/admin.html"
];

const kb = (value) => `${(value / 1024).toFixed(1)} KB`;

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const results = [];
  for (const path of PAGES) {
    await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    const metrics = await page.evaluate((origin) => {
      const resources = performance
        .getEntriesByType("resource")
        .filter((entry) => entry.name.startsWith(origin));

      const totals = resources.reduce(
        (acc, entry) => {
          acc.transfer += entry.transferSize || 0;
          acc.encoded += entry.encodedBodySize || 0;
          acc.decoded += entry.decodedBodySize || 0;
          return acc;
        },
        { transfer: 0, encoded: 0, decoded: 0 }
      );

      const heaviest = resources
        .map((entry) => ({
          name: entry.name.replace(origin, ""),
          encoded: entry.encodedBodySize || 0,
          transfer: entry.transferSize || 0,
          type: entry.initiatorType || "other"
        }))
        .sort((a, b) => (b.transfer || b.encoded) - (a.transfer || a.encoded))
        .slice(0, 5);

      return {
        requestCount: resources.length,
        totals,
        heaviest
      };
    }, ORIGIN);

    results.push({ path, ...metrics });
  }

  await browser.close();

  console.log("Page Transfer Report");
  console.log(`Origin: ${ORIGIN}`);
  console.log("");

  for (const result of results) {
    console.log(`- ${result.path}`);
    console.log(`  requests: ${result.requestCount}`);
    console.log(`  encoded: ${kb(result.totals.encoded)}`);
    console.log(`  transfer: ${kb(result.totals.transfer)}`);
    console.log("  top assets:");
    result.heaviest.forEach((asset) => {
      console.log(`    - ${asset.name} (${asset.type}) ${kb(asset.transfer || asset.encoded)}`);
    });
  }
};

run().catch((error) => {
  console.error("Failed to generate page transfer report:", error);
  process.exit(1);
});
