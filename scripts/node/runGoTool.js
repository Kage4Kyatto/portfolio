// Updated 2026-07-07
const { spawnSync } = require("child_process");
const path = require("path");

const [, , target, ...forwardArgs] = process.argv;

if (!target) {
  console.error("Usage: node scripts/node/runGoTool.js <go-file-or-package> [args...]");
  process.exit(1);
}

const userHome = process.env.USERPROFILE || process.env.HOME || "";
const candidates = [
  process.env.GO_BIN,
  "go",
  "C:\\Program Files\\Go\\bin\\go.exe",
  userHome ? path.join(userHome, "scoop", "apps", "go", "current", "bin", "go.exe") : null
].filter(Boolean);

let lastError = null;

for (const goCmd of candidates) {
  const result = spawnSync(goCmd, ["run", target, ...forwardArgs], {
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    // Try next candidate if this executable does not exist.
    if (result.error.code === "ENOENT") {
      lastError = result.error;
      continue;
    }

    console.error(`Failed to launch '${goCmd}': ${result.error.message}`);
    process.exit(1);
  }

  process.exit(result.status === null ? 1 : result.status);
}

console.error("Could not find a usable Go executable.");
if (lastError) {
  console.error(`Last error: ${lastError.message}`);
}
console.error("Install Go or set GO_BIN to your go executable path.");
process.exit(1);
