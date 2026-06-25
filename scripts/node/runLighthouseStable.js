const { spawn } = require("child_process");

const child = process.platform === "win32"
  ? spawn("cmd.exe", ["/d", "/s", "/c", "npx lhci autorun --config=./lighthouserc.stable.json"], {
      stdio: ["inherit", "pipe", "pipe"]
    })
  : spawn("npx", ["lhci", "autorun", "--config=./lighthouserc.stable.json"], {
      stdio: ["inherit", "pipe", "pipe"]
    });

let output = "";

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
});

child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stderr.write(text);
});

child.on("exit", (code) => {
  if (code === 0) {
    process.exit(0);
    return;
  }

  const generatedResults = /Generating results\.{3}/i.test(output);
  const windowsCleanupEperm = /EPERM, Permission denied/i.test(output) && /lighthouse\./i.test(output);

  if (generatedResults && windowsCleanupEperm) {
    console.warn("Lighthouse completed, but Chrome temp cleanup failed on Windows (EPERM). Treating as non-fatal.");
    process.exit(0);
    return;
  }

  process.exit(code || 1);
});
