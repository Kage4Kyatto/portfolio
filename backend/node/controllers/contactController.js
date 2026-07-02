const { addMessage, getMessages: getStoredMessages, getRateLimits, saveRateLimits } = require("../data/storage");
const { enqueueNotification } = require("../services/notificationQueue");
const { sanitizeText, sanitizeEmail, sanitizeObject } = require("../utils/sanitize");
const getClientIp = require("../utils/getClientIp");

const CONTACT_RATE_LIMIT_WINDOW_MS = Number(process.env.CONTACT_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const CONTACT_RATE_LIMIT_MAX = Number(process.env.CONTACT_RATE_LIMIT_MAX || 8);
const ALLOWED_CONTACT_KEYS = new Set(["name", "email", "subject", "message", "website"]);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IDEMPOTENCY_TTL_MS = Number(process.env.CONTACT_IDEMPOTENCY_TTL_MS || 24 * 60 * 60 * 1000);
const MAX_IDEMPOTENCY_ENTRIES = Number(process.env.CONTACT_IDEMPOTENCY_MAX_ENTRIES || 2000);
const IDEMPOTENCY_KEY_REGEX = /^[a-zA-Z0-9._:-]{8,128}$/;

// In-memory atomic rate limit tracking to prevent race conditions
const rateLimitMemory = new Map();
const idempotencyMemory = new Map();
let lastFlushTime = Date.now();
const FLUSH_INTERVAL_MS = 10000; // Flush to storage every 10 seconds
const shouldPersistRateLimits = process.env.NODE_ENV === "production";

const pruneIdempotencyMemory = () => {
  const now = Date.now();

  for (const [key, entry] of idempotencyMemory.entries()) {
    if (!entry || Number(entry.expiresAt || 0) <= now) {
      idempotencyMemory.delete(key);
    }
  }

  if (idempotencyMemory.size <= MAX_IDEMPOTENCY_ENTRIES) {
    return;
  }

  const entries = Array.from(idempotencyMemory.entries()).sort((a, b) => {
    return Number(a[1]?.createdAt || 0) - Number(b[1]?.createdAt || 0);
  });
  const toDelete = idempotencyMemory.size - MAX_IDEMPOTENCY_ENTRIES;

  for (let index = 0; index < toDelete; index += 1) {
    const key = entries[index]?.[0];
    if (key) {
      idempotencyMemory.delete(key);
    }
  }
};

const getIdempotencyResult = (key, payloadFingerprint) => {
  if (!key) {
    return null;
  }

  pruneIdempotencyMemory();
  const entry = idempotencyMemory.get(key);
  if (!entry) {
    return null;
  }

  if (entry.payloadFingerprint !== payloadFingerprint) {
    return {
      conflict: true
    };
  }

  return {
    conflict: false,
    responsePayload: entry.responsePayload
  };
};

const saveIdempotencyResult = (key, payloadFingerprint, responsePayload) => {
  if (!key) {
    return;
  }

  const now = Date.now();
  idempotencyMemory.set(key, {
    payloadFingerprint,
    responsePayload,
    createdAt: now,
    expiresAt: now + IDEMPOTENCY_TTL_MS
  });
  pruneIdempotencyMemory();
};

const flushRateLimitsToStorage = async () => {
  if (!shouldPersistRateLimits) {
    return;
  }

  const now = Date.now();
  if (now - lastFlushTime < FLUSH_INTERVAL_MS) {
    return;
  }

  try {
    const limitsObj = {};
    for (const [ip, entry] of rateLimitMemory.entries()) {
      limitsObj[ip] = entry;
    }
    await saveRateLimits(limitsObj);
    lastFlushTime = now;
  } catch (error) {
    console.error("[RateLimit] Failed to flush to storage:", error);
  }
};

const evaluateContactRateLimit = async (req) => {
  const now = Date.now();
  const ip = getClientIp(req);
  
  // Use in-memory tracking for atomic operations
  let entry = rateLimitMemory.get(ip);
  const isExpired = !entry || now - entry.windowStart >= CONTACT_RATE_LIMIT_WINDOW_MS;
  
  if (isExpired) {
    entry = {
      count: 0,
      windowStart: now,
      lastAttempt: now
    };
  }

  if (entry.count >= CONTACT_RATE_LIMIT_MAX) {
    const retryAfterMs = Math.max(1000, CONTACT_RATE_LIMIT_WINDOW_MS - (now - entry.windowStart));
    entry.lastAttempt = now;
    rateLimitMemory.set(ip, entry);
    
    // Flush periodically in background
    flushRateLimitsToStorage().catch(() => {});
    
    return {
      allowed: false,
      retryAfterSec: Math.ceil(retryAfterMs / 1000)
    };
  }

  // Increment count atomically in memory
  entry.count += 1;
  entry.lastAttempt = now;
  rateLimitMemory.set(ip, entry);
  
  // Flush periodically in background
  flushRateLimitsToStorage().catch(() => {});

  return {
    allowed: true,
    retryAfterSec: 0
  };
};

const getHealth = (req, res) => {
  const notifyTo = String(process.env.CONTACT_NOTIFY_TO || "").trim();
  const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
  const notifyFrom = String(process.env.CONTACT_NOTIFY_FROM || "").trim();

  let mode = "disabled";

  if (notifyTo) {
    mode = resendApiKey ? "resend" : "php-mail-fallback";
  }

  res.status(200).json({
    status: "ok",
    service: "portfolio-api",
    timestamp: new Date().toISOString(),
    notifications: {
      mode,
      toConfigured: Boolean(notifyTo),
      fromConfigured: Boolean(notifyFrom),
      providerConfigured: Boolean(resendApiKey)
    }
  });
};

const getMessages = async (req, res) => {
  try {
    const messages = await getStoredMessages();
    res.status(200).json(messages);
  } catch {
    res.status(500).json({
      success: false,
      message: "Failed to load messages."
    });
  }
};

const submitContact = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request payload.",
        requestId: req.requestId,
        errorCode: "INVALID_PAYLOAD"
      });
    }

    const incomingKeys = Object.keys(req.body);
    const unknownKeys = incomingKeys.filter((key) => !ALLOWED_CONTACT_KEYS.has(key));
    if (unknownKeys.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Unexpected fields in request payload.",
        requestId: req.requestId,
        errorCode: "UNEXPECTED_FIELDS"
      });
    }

    const safeBody = sanitizeObject(req.body);
    const { name, email, subject, message, website } = safeBody;
    const idempotencyKeyRaw = req.headers["x-idempotency-key"];
    const idempotencyKey = Array.isArray(idempotencyKeyRaw)
      ? String(idempotencyKeyRaw[0] || "").trim()
      : String(idempotencyKeyRaw || "").trim();

    if (idempotencyKey && !IDEMPOTENCY_KEY_REGEX.test(idempotencyKey)) {
      return res.status(400).json({
        success: false,
        message: "Invalid idempotency key format.",
        requestId: req.requestId,
        errorCode: "INVALID_IDEMPOTENCY_KEY"
      });
    }

    if (String(website || "").trim()) {
      return res.status(201).json({
        success: true,
        message: "Message received successfully."
      });
    }

    const contactRateLimit = await evaluateContactRateLimit(req);
    if (!contactRateLimit.allowed) {
      res.set("Retry-After", String(contactRateLimit.retryAfterSec));
      return res.status(429).json({
        success: false,
        message: "Too many contact attempts. Please try again later.",
        retryAfterSec: contactRateLimit.retryAfterSec,
        requestId: req.requestId,
        errorCode: "RATE_LIMIT_EXCEEDED"
      });
    }

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "All fields are required.",
        requestId: req.requestId,
        errorCode: "MISSING_REQUIRED_FIELDS"
      });
    }

    const sanitizedName = sanitizeText(name);
    const sanitizedEmail = sanitizeEmail(email);
    const sanitizedSubject = sanitizeText(subject);
    const sanitizedMessage = sanitizeText(message);

    if (!sanitizedName || !sanitizedEmail || !sanitizedSubject || !sanitizedMessage) {
      return res.status(400).json({
        success: false,
        message: "Invalid input values.",
        requestId: req.requestId,
        errorCode: "INVALID_INPUT"
      });
    }

    if (!EMAIL_REGEX.test(sanitizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format.",
        requestId: req.requestId,
        errorCode: "INVALID_EMAIL"
      });
    }

    if (sanitizedSubject.length < 3 || sanitizedMessage.length < 5) {
      return res.status(400).json({
        success: false,
        message: "Subject or message is too short.",
        requestId: req.requestId,
        errorCode: "INPUT_TOO_SHORT"
      });
    }

    if (sanitizedName.length > 120 || sanitizedSubject.length > 200 || sanitizedMessage.length > 5000) {
      return res.status(400).json({
        success: false,
        message: "Input exceeds allowed length.",
        requestId: req.requestId,
        errorCode: "INPUT_TOO_LONG"
      });
    }

    const payloadFingerprint = JSON.stringify([
      sanitizedName,
      sanitizedEmail,
      sanitizedSubject,
      sanitizedMessage
    ]);
    const idempotencyResult = getIdempotencyResult(idempotencyKey, payloadFingerprint);

    if (idempotencyResult?.conflict) {
      return res.status(409).json({
        success: false,
        message: "Idempotency key already used with a different payload.",
        requestId: req.requestId,
        errorCode: "IDEMPOTENCY_CONFLICT"
      });
    }

    if (idempotencyResult?.responsePayload) {
      return res.status(201).json({
        ...idempotencyResult.responsePayload,
        idempotent: true,
        requestId: req.requestId
      });
    }

    const newMessage = await addMessage({
      name: sanitizedName,
      email: sanitizedEmail,
      subject: sanitizedSubject,
      message: sanitizedMessage,
      createdAt: new Date().toISOString()
    });
    
    enqueueNotification({
      type: "contact_message",
      messageId: newMessage.id,
      createdAt: newMessage.createdAt
    }).catch((error) => {
      // Notification queue failure is non-fatal
      console.warn(`[Request ${req.requestId}] Notification queue error:`, error.message);
    });

    const responsePayload = {
      success: true,
      message: "Message received successfully.",
      requestId: req.requestId,
      data: newMessage
    };

    saveIdempotencyResult(idempotencyKey, payloadFingerprint, responsePayload);

    return res.status(201).json(responsePayload);
  } catch (error) {
    console.error(`[Request ${req.requestId}] Contact submission error:`, error);
    return res.status(500).json({
      success: false,
      message: "Failed to process contact request.",
      requestId: req.requestId,
      errorCode: "CONTACT_SUBMIT_FAILED"
    });
  }
};

// Initialize rate limits from persistent storage on startup
const initializeRateLimits = async () => {
  if (!shouldPersistRateLimits) {
    return;
  }

  try {
    const stored = await getRateLimits();
    const now = Date.now();
    
    for (const [ip, entry] of Object.entries(stored)) {
      // Only restore non-expired entries
      if (entry && now - entry.lastAttempt < CONTACT_RATE_LIMIT_WINDOW_MS * 2) {
        rateLimitMemory.set(ip, entry);
      }
    }
    
    console.log("[RateLimit] Initialized with", rateLimitMemory.size, "tracked IPs");
  } catch (error) {
    console.warn("[RateLimit] Failed to initialize from storage:", error.message);
  }
};

const flushRateLimitsOnShutdown = async () => {
  if (!shouldPersistRateLimits) {
    return;
  }

  // Force a final flush regardless of the periodic throttle window.
  lastFlushTime = 0;
  await flushRateLimitsToStorage();
};

module.exports = {
  getHealth,
  getMessages,
  submitContact,
  initializeRateLimits,
  flushRateLimitsOnShutdown
};
