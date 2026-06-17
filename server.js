const express = require("express");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const crypto = require("crypto");
const helmet = require("helmet");
const compression = require("compression");
const swaggerUi = require("swagger-ui-express");
const Sentry = require("@sentry/node");

const { sanitizeObject, sanitizeEmail, sanitizeText } = require("./backend/node/utils/sanitize");
const { apiLimiter, contactLimiter, adminLimiter, authLimiter } = require("./backend/node/utils/rateLimiter");

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const file = fs.readFileSync(filePath, "utf8");
  const lines = file.split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!Object.prototype.hasOwnProperty.call(process.env, key) || !process.env[key]) {
      process.env[key] = value;
    }
  });
};

loadEnvFile(path.join(__dirname, ".env"));
loadEnvFile(path.join(__dirname, ".env.local"));

const SENTRY_DSN = process.env.SENTRY_DSN || "";
if (SENTRY_DSN && process.env.NODE_ENV === "production") {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.OnUncaughtException(),
      new Sentry.Integrations.OnUnhandledRejection()
    ]
  });
}

const requireEnv = (name) => {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

if (process.env.NODE_ENV === "production") {
  requireEnv("ADMIN_SESSION_SECRET");
  requireEnv("ADMIN_USER");
  if (!process.env.ADMIN_PASS && !process.env.ADMIN_PASS_HASH) {
    throw new Error("Set either ADMIN_PASS or ADMIN_PASS_HASH in production.");
  }
}

const contactRoutes = require("./backend/node/routes/contactRoutes");
const blogRoutes = require("./backend/node/routes/blogRoutes");
const { requireCloudflareAccess } = require("./backend/node/middleware/cloudflareAccessMiddleware");
const { startNotificationWorker } = require("./backend/node/services/notificationQueue");
const { appendTelemetryEvent } = require("./backend/node/data/storage");

const app = express();
const PORT = process.env.PORT || 3000;

if (SENTRY_DSN) {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}
const REACT_DIST_PATH = path.join(__dirname, "frontend", "react-app", "dist");
const OPENAPI_PATH = path.join(__dirname, "docs", "openapi.json");
const JSON_LD_SCRIPT_HASHES = [
  "'sha256-7WKXOPhSZZW0/+9GR67no2PUzCLq78mCbn4FD1wEYwQ='",
  "'sha256-PL99IjC6uRaMSG9gHbDjSHKfzeOkhYYYgrUBj9g2WKo='",
  "'sha256-qvoON2tS90NVlq08RKFEiKvP72Q0pjOai78k6PeX3rY='",
  "'sha256-JHAvbuv8svZqF2oy5pgNXsRPsScBvrEd6xVF1KSMhNM='",
  "'sha256-VERQbRDplsuLPKkWZk2YW0at/tGgmKFsNT3z1hnQUn4='",
  "'sha256-McEZe2UrE3E2TY7c5l5a17fAFLjiEg8rFfEGm5F2lgU='",
  "'sha256-ZMgtwJX1tn9V0esW0dzNyYZ6uoizmWRqpqPvAhaBqxI='"
];
const SITE_LASTMOD = process.env.SITEMAP_LASTMOD || new Date().toISOString().slice(0, 10);
const SITEMAP_ROUTES = [
  { loc: "/index.html", changefreq: "weekly", priority: "1.0", lastmod: SITE_LASTMOD, image: "/assets/img/og-image.svg" },
  { loc: "/about.html", changefreq: "monthly", priority: "0.8", lastmod: SITE_LASTMOD },
  { loc: "/projects.html", changefreq: "weekly", priority: "0.9", lastmod: SITE_LASTMOD },
  { loc: "/services.html", changefreq: "monthly", priority: "0.7", lastmod: SITE_LASTMOD },
  { loc: "/contact.html", changefreq: "monthly", priority: "0.8", lastmod: SITE_LASTMOD },
  { loc: "/blog/", changefreq: "weekly", priority: "0.8", lastmod: SITE_LASTMOD },
  { loc: "/updates.html", changefreq: "weekly", priority: "0.7", lastmod: SITE_LASTMOD },
  { loc: "/privacy.html", changefreq: "yearly", priority: "0.4", lastmod: SITE_LASTMOD },
  { loc: "/project-portfolio-platform.html", changefreq: "monthly", priority: "0.7", lastmod: SITE_LASTMOD },
  { loc: "/project-testing-assignment.html", changefreq: "monthly", priority: "0.7", lastmod: SITE_LASTMOD }
];

const buildContentSecurityPolicy = () => {
  const scriptSources = ["'self'", ...JSON_LD_SCRIPT_HASHES].join(" ");
  const rules = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "upgrade-insecure-requests",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `script-src ${scriptSources}`,
    "connect-src 'self'"
  ];

  return rules.join("; ");
};

app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.set("X-Request-Id", requestId);

  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    console.log(JSON.stringify({
      level: "info",
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs
    }));
  });

  next();
});

app.use(helmet({
  contentSecurityPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
}));

app.use(compression());

app.use(apiLimiter);

app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=() ");
  res.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.set("Content-Security-Policy", buildContentSecurityPolicy());
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  name: "portfolio.sid",
  secret: process.env.ADMIN_SESSION_SECRET || "change-this-session-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use("/api", contactRoutes);
app.use("/api/blog", blogRoutes);

app.get("/api/docs", (req, res) => {
  if (!fs.existsSync(OPENAPI_PATH)) {
    return res.status(404).send("OpenAPI spec not found.");
  }
  const spec = JSON.parse(fs.readFileSync(OPENAPI_PATH, "utf8"));
  res.send(swaggerUi.generateHTML(spec));
});

app.get("/api/swagger.json", (req, res) => {
  if (!fs.existsSync(OPENAPI_PATH)) {
    return res.status(404).json({ error: "OpenAPI spec not found" });
  }
  res.sendFile(OPENAPI_PATH);
});

app.get("/admin", requireCloudflareAccess, (req, res) => {
  res.redirect("/admin.html");
});

app.get("/admin.html", requireCloudflareAccess, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/runtime-config.js", (req, res) => {
  res.type("application/javascript");
  res.send(
    `window.PORTFOLIO_FASTIFY_URL = ${JSON.stringify(process.env.PORTFOLIO_FASTIFY_URL || "")};`
  );
});

app.get("/api/openapi.json", (req, res) => {
  if (!fs.existsSync(OPENAPI_PATH)) {
    return res.status(404).json({
      success: false,
      message: "OpenAPI spec not found."
    });
  }

  return res.sendFile(OPENAPI_PATH);
});

app.post("/api/telemetry", express.text({ type: ["application/json", "text/plain"] }), async (req, res) => {
  try {
    const payload = typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : (req.body || {});

    const sanitized = {
      event: String(payload.event || "pageview"),
      path: String(payload.path || req.path),
      locale: String(payload.locale || "en"),
      timestamp: new Date().toISOString()
    };

    await appendTelemetryEvent(sanitized);

    return res.status(202).json({
      success: true
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid telemetry payload."
    });
  }
});

const getBaseUrl = (req) => {
  const forwardedProtoHeader = req.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoHeader)
    ? forwardedProtoHeader[0]
    : (forwardedProtoHeader || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || "http";

  return `${protocol}://${req.get("host")}`;
};

const buildSitemapXml = (baseUrl) => {
  const urls = SITEMAP_ROUTES
    .map((route) => {
      const imageTag = route.image
        ? `\n    <image:image>\n      <image:loc>${baseUrl}${route.image}</image:loc>\n    </image:image>`
        : "";

      return `  <url>\n    <loc>${baseUrl}${route.loc}</loc>\n    <lastmod>${route.lastmod}</lastmod>\n    <changefreq>${route.changefreq}</changefreq>\n    <priority>${route.priority}</priority>${imageTag}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n</urlset>\n`;
};

app.get("/robots.txt", (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.type("text/plain");
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /my-page\n\nSitemap: ${baseUrl}/sitemap.xml\n`);
});

app.get("/sitemap.xml", (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.type("application/xml");
  res.send(buildSitemapXml(baseUrl));
});

if (fs.existsSync(REACT_DIST_PATH)) {
  app.use("/app", express.static(REACT_DIST_PATH));
  app.get("/app", (req, res) => {
    res.sendFile(path.join(REACT_DIST_PATH, "index.html"));
  });
  app.get("/app/*", (req, res) => {
    res.sendFile(path.join(REACT_DIST_PATH, "index.html"));
  });
}

app.get("/my-page", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "my-page.html"));
});

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

if (SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).sendFile(path.join(__dirname, "public", "500.html"));
});

if (require.main === module) {
  startNotificationWorker();
  app.listen(PORT, () => {
    console.log(`Portfolio server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
