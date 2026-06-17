const fs = require("fs");
const path = require("path");
const { enqueueNotification } = require("../services/notificationQueue");

const messagesPath = path.join(__dirname, "..", "..", "php", "data", "messages.json");
const contactRateLimitsPath = path.join(__dirname, "..", "..", "php", "data", "contact_rate_limits.json");
const CONTACT_RATE_LIMIT_WINDOW_MS = Number(process.env.CONTACT_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const CONTACT_RATE_LIMIT_MAX = Number(process.env.CONTACT_RATE_LIMIT_MAX || 8);

const readJsonFile = (filePath, fallback) => {
  try {
    const file = fs.readFileSync(filePath, "utf8");
    return JSON.parse(file || JSON.stringify(fallback));
  } catch (error) {
    return fallback;
  }
};

const writeJsonFile = (filePath, value) => {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const readMessages = () => {
  return readJsonFile(messagesPath, []);
};

const writeMessages = (messages) => {
  writeJsonFile(messagesPath, messages);
};

const readContactRateLimits = () => readJsonFile(contactRateLimitsPath, {});
const writeContactRateLimits = (limits) => writeJsonFile(contactRateLimitsPath, limits);

const getClientIp = (req) => {
  const forwardedForHeader = req.headers["x-forwarded-for"];
  const forwardedFor = Array.isArray(forwardedForHeader)
    ? forwardedForHeader[0]
    : String(forwardedForHeader || "").split(",")[0].trim();

  return forwardedFor || req.ip || "unknown";
};

const evaluateContactRateLimit = (req) => {
  const now = Date.now();
  const ip = getClientIp(req);
  const limits = readContactRateLimits();

  Object.keys(limits).forEach((key) => {
    const entry = limits[key];
    if (!entry || now - Number(entry.lastAttempt || 0) > CONTACT_RATE_LIMIT_WINDOW_MS * 2) {
      delete limits[key];
    }
  });

  const current = limits[ip];
  const isExpired = !current || now - Number(current.windowStart || 0) >= CONTACT_RATE_LIMIT_WINDOW_MS;
  const base = isExpired
    ? {
      count: 0,
      windowStart: now,
      lastAttempt: now
    }
    : current;

  if (base.count >= CONTACT_RATE_LIMIT_MAX) {
    const retryAfterMs = Math.max(1000, CONTACT_RATE_LIMIT_WINDOW_MS - (now - Number(base.windowStart || now)));
    limits[ip] = {
      ...base,
      lastAttempt: now
    };
    writeContactRateLimits(limits);
    return {
      allowed: false,
      retryAfterSec: Math.ceil(retryAfterMs / 1000)
    };
  }

  limits[ip] = {
    ...base,
    count: Number(base.count || 0) + 1,
    lastAttempt: now
  };
  writeContactRateLimits(limits);

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

const getMessages = (req, res) => {
  const messages = readMessages();
  res.status(200).json(messages);
};

const submitContact = (req, res) => {
  const { name, email, subject, message, website } = req.body;

  if (String(website || "").trim()) {
    return res.status(201).json({
      success: true,
      message: "Message received successfully."
    });
  }

  const contactRateLimit = evaluateContactRateLimit(req);
  if (!contactRateLimit.allowed) {
    res.set("Retry-After", String(contactRateLimit.retryAfterSec));
    return res.status(429).json({
      success: false,
      message: "Too many contact attempts. Please try again later.",
      retryAfterSec: contactRateLimit.retryAfterSec
    });
  }

  if (!name || !email || !subject || !message) {
    return res.status(400).json({
      success: false,
      message: "All fields are required."
    });
  }

  const messages = readMessages();
  const newMessage = {
    id: Date.now(),
    name,
    email,
    subject,
    message,
    createdAt: new Date().toISOString()
  };

  messages.push(newMessage);
  writeMessages(messages);
  enqueueNotification({
    type: "contact_message",
    messageId: newMessage.id,
    createdAt: newMessage.createdAt
  });

  return res.status(201).json({
    success: true,
    message: "Message received successfully.",
    data: newMessage
  });
};

module.exports = {
  getHealth,
  getMessages,
  submitContact
};
