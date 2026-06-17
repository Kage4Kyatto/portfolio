const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const adminAuthAttemptsPath = path.join(__dirname, "..", "..", "php", "data", "admin_auth_attempts.json");
const ADMIN_AUTH_WINDOW_MS = Number(process.env.ADMIN_AUTH_WINDOW_MS || 15 * 60 * 1000);
const ADMIN_AUTH_MAX_ATTEMPTS = Number(process.env.ADMIN_AUTH_MAX_ATTEMPTS || 8);
const ADMIN_AUTH_LOCK_MS = Number(process.env.ADMIN_AUTH_LOCK_MS || 15 * 60 * 1000);

const readAuthAttempts = () => {
  try {
    const file = fs.readFileSync(adminAuthAttemptsPath, "utf8");
    return JSON.parse(file || "{}");
  } catch (error) {
    return {};
  }
};

const writeAuthAttempts = (attempts) => {
  fs.writeFileSync(adminAuthAttemptsPath, JSON.stringify(attempts, null, 2));
};

const getClientIp = (req) => {
  const forwardedForHeader = req.headers["x-forwarded-for"];
  const forwardedFor = Array.isArray(forwardedForHeader)
    ? forwardedForHeader[0]
    : String(forwardedForHeader || "").split(",")[0].trim();

  return forwardedFor || req.ip || "unknown";
};

const getActiveAttemptEntry = (attempts, ip, now) => {
  const current = attempts[ip];
  if (!current) {
    return {
      count: 0,
      firstAttemptAt: now,
      lastAttemptAt: now,
      lockedUntil: 0
    };
  }

  const windowExpired = now - Number(current.firstAttemptAt || 0) > ADMIN_AUTH_WINDOW_MS;
  if (windowExpired && now >= Number(current.lockedUntil || 0)) {
    return {
      count: 0,
      firstAttemptAt: now,
      lastAttemptAt: now,
      lockedUntil: 0
    };
  }

  return current;
};

const registerFailedAttempt = (req) => {
  const attempts = readAuthAttempts();
  const now = Date.now();
  const ip = getClientIp(req);
  const active = getActiveAttemptEntry(attempts, ip, now);

  const alreadyLocked = Number(active.lockedUntil || 0) > now;
  if (alreadyLocked) {
    attempts[ip] = {
      ...active,
      lastAttemptAt: now
    };
    writeAuthAttempts(attempts);
    return {
      locked: true,
      retryAfterSec: Math.ceil((Number(active.lockedUntil || now) - now) / 1000),
      attemptsRemaining: 0
    };
  }

  const nextCount = Number(active.count || 0) + 1;
  const shouldLock = nextCount >= ADMIN_AUTH_MAX_ATTEMPTS;
  const lockedUntil = shouldLock ? now + ADMIN_AUTH_LOCK_MS : 0;
  const attemptsRemaining = Math.max(0, ADMIN_AUTH_MAX_ATTEMPTS - nextCount);

  attempts[ip] = {
    count: nextCount,
    firstAttemptAt: Number(active.firstAttemptAt || now),
    lastAttemptAt: now,
    lockedUntil
  };

  writeAuthAttempts(attempts);

  return {
    locked: shouldLock,
    retryAfterSec: shouldLock ? Math.ceil(ADMIN_AUTH_LOCK_MS / 1000) : 0,
    attemptsRemaining
  };
};

const clearFailedAttempts = (req) => {
  const attempts = readAuthAttempts();
  const ip = getClientIp(req);

  if (attempts[ip]) {
    delete attempts[ip];
    writeAuthAttempts(attempts);
  }
};

const decodeCredentials = (authHeader) => {
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return null;
  }

  const encoded = authHeader.split(" ")[1];
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex === -1) {
    return null;
  }

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1)
  };
};

const toSha256Hex = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const requireAdminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const credentials = decodeCredentials(authHeader);

  const validUser = process.env.ADMIN_USER || "";
  const validPass = process.env.ADMIN_PASS || "";
  const validPassHash = process.env.ADMIN_PASS_HASH || "";

  if (!validUser || (!validPass && !validPassHash)) {
    return res.status(500).json({
      success: false,
      message: "Admin authentication is not configured."
    });
  }

  const usernameValid = credentials && safeEqual(credentials.username, validUser);
  const plainPasswordValid = credentials && validPass && safeEqual(credentials.password, validPass);
  const hashedPasswordValid =
    credentials &&
    Boolean(validPassHash) &&
    safeEqual(toSha256Hex(credentials.password), validPassHash.toLowerCase());

  if (!usernameValid || (!plainPasswordValid && !hashedPasswordValid)) {
    const lockState = registerFailedAttempt(req);
    res.set("WWW-Authenticate", 'Basic realm="Portfolio Admin"');
    if (lockState.locked) {
      res.set("Retry-After", String(lockState.retryAfterSec));
    }

    return res.status(lockState.locked ? 429 : 401).json({
      success: false,
      message: lockState.locked
        ? "Too many failed attempts. Please wait before retrying."
        : "Unauthorized",
      attemptsRemaining: lockState.attemptsRemaining,
      retryAfterSec: lockState.retryAfterSec
    });
  }

  clearFailedAttempts(req);

  return next();
};

module.exports = {
  requireAdminAuth
};
