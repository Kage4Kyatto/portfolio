// Updated 2026-07-07
const { execFile } = require("child_process");
const { promisify } = require("util");
const { getMessages } = require("../data/storage");

const execFileAsync = promisify(execFile);

const parseGoSummary = async () => {
  const baseUrl = String(process.env.GO_REPORT_SERVICE_URL || "").trim();
  if (!baseUrl) {
    throw new Error("GO_REPORT_SERVICE_URL is not configured.");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/summary`);
  if (!response.ok) {
    throw new Error(`Go summary service returned status ${response.status}.`);
  }

  const payload = await response.json();
  return {
    engine: "go",
    totalMessages: Number(payload.totalMessages || payload.total || 0),
    latestName: String(payload.latestName || ""),
    latestEmail: String(payload.latestEmail || ""),
    latestSubject: String(payload.latestSubject || "")
  };
};

const parseRustSummary = async () => {
  const { stdout } = await execFileAsync(
    "cargo",
    [
      "run",
      "--manifest-path",
      "tools/rust/message_summary/Cargo.toml",
      "--",
      "--json"
    ],
    {
      timeout: 15000,
      maxBuffer: 1024 * 1024
    }
  );

  const parsed = JSON.parse(String(stdout || "{}"));
  return {
    engine: "rust",
    totalMessages: Number(parsed.totalMessages || 0),
    latestName: String(parsed.latestName || ""),
    latestEmail: String(parsed.latestEmail || ""),
    latestSubject: String(parsed.latestSubject || "")
  };
};

const parseJsSummary = async () => {
  const messages = await getMessages();
  const latest = messages.length > 0 ? messages[messages.length - 1] : null;

  return {
    engine: "js",
    totalMessages: messages.length,
    latestName: String(latest?.name || ""),
    latestEmail: String(latest?.email || ""),
    latestSubject: String(latest?.subject || "")
  };
};

const getSummary = async (requestedEngine = "auto") => {
  const engine = String(requestedEngine || "auto").toLowerCase();

  if (engine === "go") {
    return parseGoSummary();
  }

  if (engine === "rust") {
    return parseRustSummary();
  }

  if (engine === "js") {
    return parseJsSummary();
  }

  try {
    return await parseGoSummary();
  } catch {
    return parseJsSummary();
  }
};

module.exports = {
  getSummary
};

