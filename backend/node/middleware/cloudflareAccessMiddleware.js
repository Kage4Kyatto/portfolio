const toBool = (value) => String(value || "").trim().toLowerCase() === "true";

const isCloudflareAccessEnabled = () => toBool(process.env.CF_ACCESS_ENABLED);

const isLocalRequest = (req) => {
  const host = String(req.hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
};

const getAllowedEmails = () =>
  String(process.env.CF_ACCESS_ALLOWED_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const requireCloudflareAccess = (req, res, next) => {
  if (isLocalRequest(req)) {
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
