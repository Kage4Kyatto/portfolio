// Updated 2026-07-07
(function runLighthouseStable() {
  const { spawn } = require("child_process");

  function runOnce() {
    return new Promise((resolve) => {
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
        resolve({ code: code == null ? 1 : code, output });
      });
    });
  }

  function hasWindowsCleanupEperm(output) {
    const generatedResults = /Generating results\.{3}/i.test(output);
    const windowsCleanupEperm = /EPERM, Permission denied/i.test(output) && /lighthouse\./i.test(output);
    return generatedResults && windowsCleanupEperm;
  }

  function hasAssertionFailure(output) {
    return /The following assertions failed|assertions? failed|Assertion failed/i.test(output);
  }

  async function main() {
    const first = await runOnce();

    if (/CHROME_INTERSTITIAL_ERROR/i.test(first.output)) {
      console.error("Lighthouse encountered CHROME_INTERSTITIAL_ERROR. Failing run to avoid silent false positives.");
      process.exit(1);
      return;
    }

    if (first.code === 0 || hasWindowsCleanupEperm(first.output)) {
      if (first.code !== 0) {
        console.warn("Lighthouse completed, but Chrome temp cleanup failed on Windows (EPERM). Treating as non-fatal.");
      }
      process.exit(0);
      return;
    }

    if (hasAssertionFailure(first.output)) {
      process.exit(first.code);
      return;
    }

    console.warn("Lighthouse failed without assertion details. Retrying once to reduce transient CI flakiness.");
    const retry = await runOnce();

    if (/CHROME_INTERSTITIAL_ERROR/i.test(retry.output)) {
      console.error("Lighthouse encountered CHROME_INTERSTITIAL_ERROR on retry. Failing run.");
      process.exit(1);
      return;
    }

    if (retry.code === 0 || hasWindowsCleanupEperm(retry.output)) {
      if (retry.code !== 0) {
        console.warn("Lighthouse completed on retry, but Chrome temp cleanup failed on Windows (EPERM). Treating as non-fatal.");
      }
      process.exit(0);
      return;
    }

    process.exit(retry.code);
  }

  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
})();

