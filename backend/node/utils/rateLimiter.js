// Updated 2026-07-07
const rateLimit = require("express-rate-limit");
const getClientIp = require("./getClientIp");

const createLimiter = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 100,
    message: options.message || "Too many requests, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return options.keyGenerator ? options.keyGenerator(req) : getClientIp(req);
    },
    skip: () => {
      return process.env.NODE_ENV === "test";
    },
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message: options.message || "Too many requests, please try again later."
      });
    },
    ...options
  });
};

const CONTACT_RATE_LIMIT_WINDOW_MS = Number(process.env.CONTACT_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const CONTACT_RATE_LIMIT_MAX = Number(process.env.CONTACT_RATE_LIMIT_MAX || 8);

// Centralized rate limiter configuration
const limiterConfig = {
  api: {
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Too many API requests",
    skip: (req) => {
      if (process.env.NODE_ENV === "test") {
        return true;
      }

      const exemptPaths = new Set(["/telemetry", "/health", "/version"]);
      return exemptPaths.has(req.path);
    }
  },
  contact: {
    windowMs: CONTACT_RATE_LIMIT_WINDOW_MS,
    max: CONTACT_RATE_LIMIT_MAX,
    message: "Too many contact submissions, please try again later.",
    keyGenerator: (req) => getClientIp(req)
  },
  admin: {
    windowMs: 5 * 60 * 1000,
    max: 10,
    message: "Too many admin requests"
  },
  auth: {
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: "Too many login attempts, please try again later.",
    skipSuccessfulRequests: true,
    keyGenerator: (req) => getClientIp(req)
  }
};

const apiLimiter = createLimiter(limiterConfig.api);
const contactLimiter = createLimiter(limiterConfig.contact);
const adminLimiter = createLimiter(limiterConfig.admin);
const authLimiter = createLimiter(limiterConfig.auth);

module.exports = {
  createLimiter,
  limiterConfig,
  apiLimiter,
  contactLimiter,
  adminLimiter,
  authLimiter
};

