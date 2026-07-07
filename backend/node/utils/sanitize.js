// Updated 2026-07-07
const xss = require("xss");

const sanitizeHtml = (input) => {
  if (typeof input !== "string") {
    return input;
  }
  return xss(input, {
    whiteList: {},
    stripIgnoredTag: true,
    stripLeadingAndTrailingWhitespace: true
  });
};

const sanitizeText = (input) => {
  if (typeof input !== "string") {
    return input;
  }
  return input.trim().slice(0, 10000);
};

const sanitizeEmail = (input) => {
  if (typeof input !== "string") {
    return "";
  }
  return input.trim().toLowerCase().slice(0, 254);
};

const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  const sanitized = {};
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === "string") {
      sanitized[key] = sanitizeText(value);
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

module.exports = {
  sanitizeHtml,
  sanitizeText,
  sanitizeEmail,
  sanitizeObject
};

