/**
 * Extract client IP address from request headers
 * Checks multiple header sources for IP in order of preference
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
const getClientIp = (req) => {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const realIp = String(req.headers["x-real-ip"] || "").trim();
  const remote = String(req.connection?.remoteAddress || "").trim();

  const candidate = forwarded || realIp || remote || "unknown";

  return candidate
    .replace(/^\[|\]$/g, "")
    .replace(/^::ffff:/, "")
    .trim() || "unknown";
};

module.exports = getClientIp;
