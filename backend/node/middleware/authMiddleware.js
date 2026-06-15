const crypto = require("crypto");

const decodeCredentials = (authHeader) => {
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return null;
  }

  const encoded = authHeader.split(" ")[1];
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex === -1) {
    return null;
  }

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1)
  };
};

const toSha256Hex = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const requireAdminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const credentials = decodeCredentials(authHeader);

  const validUser = process.env.ADMIN_USER || "";
  const validPass = process.env.ADMIN_PASS || "";
  const validPassHash = process.env.ADMIN_PASS_HASH || "";

  if (!validUser || (!validPass && !validPassHash)) {
    return res.status(500).json({
      success: false,
      message: "Admin authentication is not configured."
    });
  }

  const usernameValid = credentials && safeEqual(credentials.username, validUser);
  const plainPasswordValid = credentials && validPass && safeEqual(credentials.password, validPass);
  const hashedPasswordValid =
    credentials &&
    Boolean(validPassHash) &&
    safeEqual(toSha256Hex(credentials.password), validPassHash.toLowerCase());

  if (!usernameValid || (!plainPasswordValid && !hashedPasswordValid)) {
    res.set("WWW-Authenticate", 'Basic realm="Portfolio Admin"');
    return res.status(401).json({
      success: false,
      message: "Unauthorized"
    });
  }

  return next();
};

module.exports = {
  requireAdminAuth
};
