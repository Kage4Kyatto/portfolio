// Updated 2026-07-07
const toBool = (value) => String(value || "").trim().toLowerCase() === "true";

const normalizeIp = (value) => String(value || "")
  .split(",")[0]
  .trim()
  .replace(/^\[|\]$/g, "")
  .replace(/^::ffff:/, "");

/**
 * Extract client IP address from request context.
 * By default, forwarded headers are ignored to prevent spoofing.
 * Set PORTFOLIO_TRUST_PROXY_HEADERS=true only behind a trusted proxy.
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
const getClientIp = (req) => {
  const trustProxyHeaders = toBool(process.env.PORTFOLIO_TRUST_PROXY_HEADERS);
  const forwarded = trustProxyHeaders
    ? normalizeIp(req.headers["x-forwarded-for"] || req.headers["x-real-ip"])
    : "";
  const expressIp = normalizeIp(req.ip);
  const remote = normalizeIp(req.socket?.remoteAddress || req.connection?.remoteAddress);

  return forwarded || expressIp || remote || "unknown";
};

module.exports = getClientIp;

