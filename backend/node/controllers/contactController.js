const { addMessage, getMessages: getStoredMessages, getRateLimits, saveRateLimits } = require("../data/storage");
const { enqueueNotification } = require("../services/notificationQueue");
const { sanitizeText, sanitizeEmail } = require("../utils/sanitize");
const getClientIp = require("../utils/getClientIp");

const CONTACT_RATE_LIMIT_WINDOW_MS = Number(process.env.CONTACT_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const CONTACT_RATE_LIMIT_MAX = Number(process.env.CONTACT_RATE_LIMIT_MAX || 8);

const evaluateContactRateLimit = async (req) => {
  const now = Date.now();
  const ip = getClientIp(req);
  const limits = await getRateLimits();

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
    await saveRateLimits(limits);
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
  await saveRateLimits(limits);

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
        retryAfterSec: contactRateLimit.retryAfterSec
      });
    }

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "All fields are required."
      });
    }

    const sanitizedName = sanitizeText(name);
    const sanitizedEmail = sanitizeEmail(email);
    const sanitizedSubject = sanitizeText(subject);
    const sanitizedMessage = sanitizeText(message);

    if (!sanitizedName || !sanitizedEmail || !sanitizedSubject || !sanitizedMessage) {
      return res.status(400).json({
        success: false,
        message: "Invalid input values."
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
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: "Message received successfully.",
      data: newMessage
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to process contact request."
    });
  }
};

module.exports = {
  getHealth,
  getMessages,
  submitContact
};
