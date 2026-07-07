// Updated 2026-07-07
const express = require("express");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const crypto = require("crypto");
const helmet = require("helmet");
const compression = require("compression");
const swaggerUi = require("swagger-ui-express");
const Sentry = require("@sentry/node");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config({ path: path.join(__dirname, ".env.local"), override: true });

const { apiLimiter } = require("./backend/node/utils/rateLimiter");

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
  requireEnv("SITE_BASE_URL");
  if (!process.env.ADMIN_PASS && !process.env.ADMIN_PASS_HASH) {
    throw new Error("Set either ADMIN_PASS or ADMIN_PASS_HASH in production.");
  }
}

// Validate session secret is not using default
const sessionSecret = process.env.ADMIN_SESSION_SECRET || "dev-insecure-session-secret";
if (process.env.NODE_ENV === "production" && !process.env.ADMIN_SESSION_SECRET) {
  throw new Error("ADMIN_SESSION_SECRET is required in production and cannot use default");
}

const contactRoutes = require("./backend/node/routes/contactRoutes");
const blogRoutes = require("./backend/node/routes/blogRoutes");
const { requireCloudflareAccess } = require("./backend/node/middleware/cloudflareAccessMiddleware");
const { appendTelemetryEvent } = require("./backend/node/data/storage");
const { initializeRateLimits, flushRateLimitsOnShutdown } = require("./backend/node/controllers/contactController");
const { recordRequest } = require("./backend/node/services/performanceMetrics");
const packageJson = require("./package.json");

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const TRUST_PROXY = String(process.env.TRUST_PROXY || "").trim();
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "100kb";
const URLENCODED_BODY_LIMIT = process.env.URLENCODED_BODY_LIMIT || "50kb";
const MAX_TELEMETRY_PATH_LENGTH = Number(process.env.MAX_TELEMETRY_PATH_LENGTH || 2048);
const SITE_BASE_URL = String(process.env.SITE_BASE_URL || "").trim();

let canonicalSiteBaseUrl = "";
if (SITE_BASE_URL) {
  try {
    canonicalSiteBaseUrl = new URL(SITE_BASE_URL).origin;
  } catch {
    throw new Error("SITE_BASE_URL must be a valid absolute URL.");
  }
}

if (TRUST_PROXY) {
  const trustProxyValue = TRUST_PROXY === "true"
    ? true
    : (TRUST_PROXY === "false" ? false : TRUST_PROXY);
  app.set("trust proxy", trustProxyValue);
}

const DEV_LIVE_RELOAD_ENABLED = !IS_PRODUCTION && process.env.DEV_LIVE_RELOAD !== "false";
const devReloadClients = new Set();
const devReloadWatchers = [];

const sendDevReload = (payload = {}) => {
  const message = `event: reload\ndata: ${JSON.stringify({
    timestamp: Date.now(),
    ...payload
  })}\n\n`;

  devReloadClients.forEach((client) => {
    try {
      client.write(message);
    } catch {
      devReloadClients.delete(client);
    }
  });
};

const createDevReloadWatcher = (targetPath, options = {}) => {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  try {
    const watcher = fs.watch(targetPath, options, (eventType, changedFile) => {
      if (!changedFile) {
        return;
      }

      const changed = String(changedFile);
      if (changed.includes("node_modules") || changed.includes(".git")) {
        return;
      }

      sendDevReload({
        eventType,
        path: changed,
        source: path.basename(targetPath)
      });
    });

    devReloadWatchers.push(watcher);
  } catch (error) {
    console.warn("Dev live-reload watcher failed:", targetPath, error.message);
  }
};

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
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "style-src 'self' https://fonts.googleapis.com",
    `script-src ${scriptSources}`,
    "connect-src 'self'"
  ];

  if (IS_PRODUCTION) {
    rules.push("upgrade-insecure-requests");
  }

  return rules.join("; ");
};

app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.set("X-Request-Id", requestId);

  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    recordRequest(req.originalUrl, res.statusCode, durationMs);
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
  hsts: IS_PRODUCTION
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false
}));

app.use(compression());

app.use("/api", apiLimiter);

app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=() ");
  if (IS_PRODUCTION) {
    res.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  res.set("Content-Security-Policy", buildContentSecurityPolicy());
  next();
});

app.use(express.json({
  limit: JSON_BODY_LIMIT,
  strict: true
}));
app.use(express.urlencoded({
  extended: true,
  limit: URLENCODED_BODY_LIMIT,
  parameterLimit: 100
}));

app.use(session({
  name: "portfolio.sid",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
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
    `window.PORTFOLIO_FASTIFY_URL = ${JSON.stringify(process.env.PORTFOLIO_FASTIFY_URL || "")};\nwindow.PORTFOLIO_APP_VERSION = ${JSON.stringify(packageJson.version || "0.0.0")};`
  );
});

app.get("/api/version", (req, res) => {
  res.status(200).json({
    success: true,
    version: packageJson.version || "0.0.0",
    commit: process.env.GIT_COMMIT_SHA || "unknown",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString()
  });
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

if (DEV_LIVE_RELOAD_ENABLED) {
  app.get("/dev/live-reload", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    res.write("retry: 1000\n\n");
    devReloadClients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write("event: ping\\ndata: {}\\n\\n");
      } catch {
        clearInterval(heartbeat);
        devReloadClients.delete(res);
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      devReloadClients.delete(res);
    });
  });
}

app.post("/api/telemetry", express.text({ type: ["application/json", "text/plain"], limit: "8kb" }), async (req, res) => {
  try {
    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    if (!contentType.includes("application/json") && !contentType.includes("text/plain")) {
      return res.status(415).json({
        success: false,
        message: "Unsupported content type."
      });
    }

    const payload = typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : (req.body || {});

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({
        success: false,
        message: "Invalid telemetry payload."
      });
    }

    const validEvents = new Set(["pageview", "click", "form_submit", "error", "navigation"]);
    const requestedEvent = String(payload.event || "pageview").toLowerCase();
    const event = validEvents.has(requestedEvent) ? requestedEvent : "pageview";
    const locale = /^[a-z]{2}(-[A-Z]{2})?$/.test(String(payload.locale || "").trim())
      ? String(payload.locale)
      : "en";
    const rawPath = String(payload.path || req.path || "/").trim();
    if (!rawPath || rawPath.length > MAX_TELEMETRY_PATH_LENGTH) {
      return res.status(400).json({
        success: false,
        message: "Invalid telemetry payload."
      });
    }

    const pathValue = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

    const sanitized = {
      event,
      path: pathValue,
      locale,
      timestamp: new Date().toISOString()
    };

    await appendTelemetryEvent(sanitized);

    return res.status(202).json({
      success: true
    });
  } catch {
    return res.status(400).json({
      success: false,
      message: "Invalid telemetry payload."
    });
  }
});

const getBaseUrl = (req) => {
  if (canonicalSiteBaseUrl) {
    return canonicalSiteBaseUrl;
  }

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
  app.get(/^\/app\/.*/, (req, res) => {
    res.sendFile(path.join(REACT_DIST_PATH, "index.html"));
  });
}

app.get("/my-page", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "my-page.html"));
});

const setStaticCacheHeaders = (res, filePath) => {
  const normalizedPath = filePath.replace(/\\/g, "/");

  // In local/dev, always serve the latest files so UI changes appear right after refresh.
  if (!IS_PRODUCTION) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return;
  }

  if (normalizedPath.endsWith("/service-worker.js") || normalizedPath.endsWith("/manifest.webmanifest")) {
    res.setHeader("Cache-Control", "no-cache");
    return;
  }

  if (normalizedPath.endsWith(".html")) {
    res.setHeader("Cache-Control", "no-cache");
    return;
  }

  if (
    normalizedPath.includes("/public/assets/js/core/main.js") ||
    normalizedPath.includes("/public/assets/i18n/") ||
    normalizedPath.includes("/public/assets/css/styles.css")
  ) {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    return;
  }

  if (normalizedPath.includes("/public/assets/")) {
    res.setHeader("Cache-Control", "public, max-age=604800");
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=86400");
};

app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: setStaticCacheHeaders
}));

app.get(/.*/, (req, res) => {
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
  initializeRateLimits().catch((error) => {
    console.error("Failed to initialize rate limits:", error);
  });

  if (DEV_LIVE_RELOAD_ENABLED) {
    createDevReloadWatcher(path.join(__dirname, "public"), { recursive: true });
    createDevReloadWatcher(path.join(__dirname, "docs"), { recursive: true });
    console.log("Dev live-reload enabled");
  }

  const server = app.listen(PORT, () => {
    console.log(`Portfolio server running on http://localhost:${PORT}`);
  });
  let isShuttingDown = false;

  const handleShutdown = async () => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    try {
      await flushRateLimitsOnShutdown();
    } catch (error) {
      console.error("Failed to flush rate limits on shutdown:", error);
    } finally {
      devReloadWatchers.forEach((watcher) => {
        try {
          watcher.close();
        } catch {}
      });

      server.close(() => {
        process.exit(0);
      });
    }
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason);
  });
}

module.exports = app;

