// Updated 2026-07-07
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const adminScriptPath = path.join(__dirname, "..", "public", "assets", "js", "pages", "admin.js");

const loadFetchJsonWithFallback = () => {
  const source = fs.readFileSync(adminScriptPath, "utf8");
  const startMarker = "const fetchJsonWithFallback = async (endpoints, options = {}) => {";
  const endMarker = "const loadDeliveryStatus = async () => {";
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error("Could not locate fetchJsonWithFallback in admin.js");
  }

  const functionSource = source.slice(startIndex, endIndex)
    .replace("const fetchJsonWithFallback = ", "")
    .trim()
    .replace(/;\s*$/, "");

  return new Function("t", "activeLocale", "fetch", `return ${functionSource};`);
};

test("admin fetchJsonWithFallback returns an empty object for an empty successful response", async () => {
  const factory = loadFetchJsonWithFallback();
  const fetchJsonWithFallback = factory(
    (_key, fallback) => fallback,
    "en",
    async () => ({
      ok: true,
      status: 200,
      text: async () => ""
    })
  );

  const result = await fetchJsonWithFallback(["/api/admin/metrics"]);

  assert.deepEqual(result, {});
});