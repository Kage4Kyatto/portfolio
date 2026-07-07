const toBool = (value) => String(value || "").trim().toLowerCase() === "true";

const isCloudflareAccessEnabled = () => toBool(process.env.CF_ACCESS_ENABLED);
const allowLocalBypass = () =>
  process.env.NODE_ENV !== "production" && toBool(process.env.CF_ACCESS_ALLOW_LOCAL_BYPASS || "true");

const normalizeIp = (value) => String(value || "")
  .trim()
  .replace(/^\[|\]$/g, "")
  .replace(/^::ffff:/, "");

const isLocalRequest = (req) => {
  const remote = normalizeIp(req.socket?.remoteAddress || req.connection?.remoteAddress);
  return remote === "127.0.0.1" || remote === "::1";
};

const getAllowedEmails = () =>
  String(process.env.CF_ACCESS_ALLOWED_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const requireCloudflareAccess = (req, res, next) => {
  if (allowLocalBypass() && isLocalRequest(req)) {
    return next();
  }

  if (!isCloudflareAccessEnabled()) {
    return next();
  }

  const authenticatedEmail = String(req.headers["cf-access-authenticated-user-email"] || "")
    .trim()
    .toLowerCase();

  if (!authenticatedEmail) {
    return res.status(403).json({
      success: false,
      message: "Cloudflare Access authentication required."
    });
  }

  const allowedEmails = getAllowedEmails();
  if (allowedEmails.length && !allowedEmails.includes(authenticatedEmail)) {
    return res.status(403).json({
      success: false,
      message: "Cloudflare Access user is not allowed."
    });
  }

  return next();
};

module.exports = {
  requireCloudflareAccess,
  isCloudflareAccessEnabled
};
