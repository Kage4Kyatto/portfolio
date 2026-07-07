// Updated 2026-07-07
const { spawnSync } = require("child_process");

const quoteArg = (value) => {
  if (!/\s/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '\\"')}"`;
};

const run = (command, args) => {
  const isWindows = process.platform === "win32";
  const result = isWindows
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", [command, ...args].map(quoteArg).join(" ")], {
      stdio: "inherit"
    })
    : spawnSync(command, args, {
      stdio: "inherit"
    });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

console.log("[setup] Installing root dependencies...");
run("npm", ["install"]);

console.log("[setup] Installing frontend dependencies...");
run("npm", ["--prefix", "frontend/react-app", "install"]);

console.log("[setup] Installing Fastify backend dependencies...");
run("npm", ["--prefix", "backend/fastify", "install"]);

console.log("[setup] Development environment is ready.");

