const { addMessage, getMessages: getStoredMessages, getRateLimits, saveRateLimits } = require("../data/storage");
const { enqueueNotification } = require("../services/notificationQueue");
const { sanitizeText, sanitizeEmail } = require("../utils/sanitize");
const getClientIp = require("../utils/getClientIp");

const CONTACT_RATE_LIMIT_WINDOW_MS = Number(process.env.CONTACT_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const CONTACT_RATE_LIMIT_MAX = Number(process.env.CONTACT_RATE_LIMIT_MAX || 8);

// In-memory atomic rate limit tracking to prevent race conditions
const rateLimitMemory = new Map();
let lastFlushTime = Date.now();
const FLUSH_INTERVAL_MS = 10000; // Flush to storage every 10 seconds
const shouldPersistRateLimits = process.env.NODE_ENV === "production";

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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load messages."
    });
  }
};

const submitContact = async (req, res) => {
  try {
    const { name, email, subject, message, website } = req.body;

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

    return res.status(201).json({
      success: true,
      message: "Message received successfully.",
      requestId: req.requestId,
      data: newMessage
    });
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
