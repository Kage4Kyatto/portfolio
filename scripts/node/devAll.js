// Updated 2026-07-07
const { spawn } = require("child_process");

const projectRoot = process.cwd();

const processes = [
  { name: "node-api", command: "npm start" },
  { name: "fastify", command: "npm run dev:fastify" },
  { name: "php", command: "php -S localhost:8000 -t public" },
  { name: "react", command: "npm --prefix frontend/react-app run dev" }
];

let isShuttingDown = false;
const children = [];

const terminateChild = (child) => {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      shell: true
    });
    return;
  }

  child.kill("SIGTERM");
};

const shutdown = (code = 0) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  for (const child of children) {
    terminateChild(child.process);
  }

  setTimeout(() => process.exit(code), 500);
};

for (const processConfig of processes) {
  console.log(`[dev:all] starting ${processConfig.name}...`);
  const child = spawn(processConfig.command, {
    cwd: projectRoot,
    env: process.env,
    shell: true,
    stdio: "inherit"
  });

  child.on("exit", (code) => {
    if (isShuttingDown) {
      return;
    }

    if (code !== 0) {
      console.error(`[dev:all] ${processConfig.name} exited with code ${code}. Stopping all services.`);
      shutdown(code);
    }
  });

  child.on("error", (error) => {
    if (isShuttingDown) {
      return;
    }

    console.error(`[dev:all] failed to start ${processConfig.name}:`, error.message);
    shutdown(1);
  });

  children.push({
    name: processConfig.name,
    process: child
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

