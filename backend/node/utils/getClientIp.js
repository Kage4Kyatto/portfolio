/**
 * Extract client IP address from request headers
 * Checks multiple header sources for IP in order of preference
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
const getClientIp = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.connection?.remoteAddress ||
    "unknown"
  );
};

module.exports = getClientIp;
