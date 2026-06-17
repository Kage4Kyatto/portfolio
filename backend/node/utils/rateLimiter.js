const rateLimit = require("express-rate-limit");

const createLimiter = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 100,
    message: options.message || "Too many requests, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
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

// Centralized rate limiter configuration
const limiterConfig = {
  api: {
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Too many API requests"
  },
  contact: {
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: "Too many contact submissions, please try again later.",
    keyGenerator: (req) => req.ip || req.connection.remoteAddress
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
    skipSuccessfulRequests: true
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
