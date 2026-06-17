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

const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many API requests"
});

const contactLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Too many contact submissions, please try again later.",
  keyGenerator: (req) => req.ip || req.connection.remoteAddress
});

const adminLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: "Too many admin requests"
});

const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts, please try again later.",
  skipSuccessfulRequests: true
});

module.exports = {
  createLimiter,
  apiLimiter,
  contactLimiter,
  adminLimiter,
  authLimiter
};
