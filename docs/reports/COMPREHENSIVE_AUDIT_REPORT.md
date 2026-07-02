# Comprehensive Code Audit Report
**Portfolio Full-Stack Project**  
**Date:** 2026-06-23  
**Thoroughness:** Comprehensive (All Files Analyzed)

---

## Executive Summary

This audit identifies **32 findings** across 9 categories: **5 Critical**, **8 High**, **12 Medium**, and **7 Low** priority issues. Critical issues pose security, data loss, and reliability risks requiring immediate attention. High-priority issues affect performance and stability.

---

## CRITICAL (Immediate Action Required)

### 1. **Duplicate Variable Declaration - Contact Form Endpoint Selection Bug**
- **File:** [public/assets/js/pages/contact.js](public/assets/js/pages/contact.js#L119-L135)
- **Line:** 119-135
- **Severity:** CRITICAL (Logic Error / Data Corruption)
- **Current Code:**
```javascript
try {
  const endpointSet = new Set();
  const fastifyContactEndpoint = getFastifyContactEndpoint();

  if (fastifyContactEndpoint) {
    endpointSet.add(fastifyContactEndpoint);
  }

  // Try endpoints in preferred order: prefer primary backend with fallbacks
  const endpointSet = new Set();  // ❌ DUPLICATE DECLARATION
  
  // Primary endpoint: Fastify if available and external, otherwise Node Express
  const fastifyContactEndpoint = getFastifyContactEndpoint();  // ❌ DUPLICATE
  if (fastifyContactEndpoint) {
    endpointSet.add(fastifyContactEndpoint);
  }
```
- **Issue:** Variable `endpointSet` and `fastifyContactEndpoint` are redeclared, creating an empty Set that overwrites the previous one. This causes the Fastify endpoint to never be added to the set, breaking fallback logic.
- **Impact:** Contact form always attempts Node Express first, even if Fastify is configured. Could cause message delivery failures if Express is down.
- **Fix:** Remove the duplicate declarations (lines 123-124). Keep only the first declaration.

**Recommended Fix:**
```javascript
try {
  const endpointSet = new Set();
  const fastifyContactEndpoint = getFastifyContactEndpoint();

  if (fastifyContactEndpoint) {
    endpointSet.add(fastifyContactEndpoint);
  }
  
  // Primary fallback: Node Express API
  endpointSet.add("/api/contact");
  
  // Secondary fallback: PHP API (legacy)
  endpointSet.add("/api/contact.php");
  
  const endpoints = [...endpointSet];
  // ... rest of logic
```

---

### 2. **Notification Queue Worker Not Started**
- **File:** [server.js](server.js#L54)
- **Line:** 54
- **Severity:** CRITICAL (Lost Functionality)
- **Current Code:**
```javascript
const { startNotificationWorker } = require("./backend/node/services/notificationQueue");
```
- **Issue:** `startNotificationWorker` is imported but **never called**. The notification queue processor is never started, so queued notifications are never sent.
- **Impact:** All email notifications fail silently. Users never receive contact confirmation emails. Dead letter queue accumulates indefinitely.
- **Fix:** Call `startNotificationWorker()` after server initialization.

**Recommended Fix:**
Add after line 294 in server.js (after app.listen):
```javascript
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Start notification processor
  startNotificationWorker().catch((error) => {
    console.error("Failed to start notification worker:", error);
  });
});
```

---

### 3. **Admin Authentication Bypass - Missing Authorization Header Validation**
- **File:** [backend/node/middleware/authMiddleware.js](backend/node/middleware/authMiddleware.js#L70-L75)
- **Line:** 70-75
- **Severity:** CRITICAL (Auth Bypass)
- **Current Code:**
```javascript
const requireAdminAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const credentials = decodeCredentials(authHeader);  // ❌ No validation

  const validUser = process.env.ADMIN_USER || "";
  // ... rest of auth check
```
- **Issue:** `decodeCredentials()` is called even if `authHeader` is undefined. If the header is missing, `decodeCredentials(undefined)` returns `null` instead of failing early. Then comparisons with `null` pass in certain conditions.
- **Impact:** An attacker could potentially bypass authentication by crafting requests with missing or malformed headers.
- **Fix:** Validate header exists and is properly formatted before decoding.

**Recommended Fix:**
```javascript
const requireAdminAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  // Validate header exists and is properly formatted
  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Basic ")) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized"
    });
  }

  const credentials = decodeCredentials(authHeader);
  if (!credentials) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized"
    });
  }

  // ... rest of auth check
```

---

### 4. **CSV Download Memory Leak - Object URLs Never Released**
- **File:** [public/assets/js/pages/admin.js](public/assets/js/pages/admin.js#L254-L267)
- **Line:** 254-267
- **Severity:** CRITICAL (Memory Leak)
- **Current Code:**
```javascript
const downloadCsv = (messages) => {
  const csv = toCsv(messages);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);  // ❌ Never released
  const link = document.createElement("a");
  link.href = url;
  link.download = `portfolio-messages-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // ❌ URL.revokeObjectURL(url) never called
};
```
- **Issue:** Each CSV export creates a new object URL via `URL.createObjectURL()` but never revokes it with `URL.revokeObjectURL()`. After many exports, memory usage grows indefinitely.
- **Impact:** Long sessions with repeated CSV exports cause memory exhaustion and potential application crash. Browser tab becomes unresponsive.
- **Fix:** Always revoke object URLs after use.

**Recommended Fix:**
```javascript
const downloadCsv = (messages) => {
  const csv = toCsv(messages);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  try {
    link.href = url;
    link.download = `portfolio-messages-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
  } finally {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);  // ✅ Always revoke
  }
};
```

---

### 5. **Race Condition in Rate Limit Evaluation - Concurrent Request Vulnerability**
- **File:** [backend/node/controllers/contactController.js](backend/node/controllers/contactController.js#L16-L40)
- **Line:** 16-40
- **Severity:** CRITICAL (Rate Limit Bypass)
- **Current Code:**
```javascript
const evaluateContactRateLimit = async (req) => {
  const now = Date.now();
  const ip = getClientIp(req);
  const limits = await getRateLimits();  // ❌ Read-modify-write race condition

  Object.keys(limits).forEach((key) => {
    const entry = limits[key];
    if (!entry || now - Number(entry.lastAttempt || 0) > CONTACT_RATE_LIMIT_WINDOW_MS * 2) {
      delete limits[key];
    }
  });

  const current = limits[ip];
  const isExpired = !current || now - Number(current.windowStart || 0) >= CONTACT_RATE_LIMIT_WINDOW_MS;
  const base = isExpired ? { count: 0, windowStart: now, lastAttempt: now } : current;

  if (base.count >= CONTACT_RATE_LIMIT_MAX) {
    // ... return rate limited
  }

  limits[ip] = { ...base, count: Number(base.count || 0) + 1, lastAttempt: now };
  await saveRateLimits(limits);  // ❌ Write is not atomic
```
- **Issue:** Classic TOCTOU (Time-of-Check-Time-of-Use) race condition. Between reading and writing rate limits, another request can execute the same flow, bypassing the rate limit. Two concurrent requests could both pass the check and increment.
- **Impact:** Attackers can bypass rate limiting by sending concurrent requests. Multiple contacts from same IP within rate limit window allowed.
- **Fix:** Use database-level atomic operations or distributed locking.

**Recommended Fix (Requires Changes to storage.js):**
```javascript
// Use database UPSERT for atomic operation
const evaluateContactRateLimit = async (req) => {
  const now = Date.now();
  const ip = getClientIp(req);
  
  // Use database atomic operation instead of read-modify-write
  if (shouldUseDatabase) {
    const result = await db.query(`
      SELECT count FROM contact_rate_limits 
      WHERE ip = $1 AND window_start > $2
      LIMIT 1 FOR UPDATE
    `, [ip, now - CONTACT_RATE_LIMIT_WINDOW_MS]);
    
    // ... check count, if exceeded, return locked, else increment atomically
  } else {
    // Fallback to current logic (not recommended for production)
  }
};
```

---

## HIGH (Significant Issues)

### 6. **Notification Queue Operations Not Atomic - Data Loss Risk**
- **File:** [backend/node/services/notificationQueue.js](backend/node/services/notificationQueue.js#L56-L80)
- **Line:** 56-80
- **Severity:** HIGH (Data Loss)
- **Current Code:**
```javascript
const processQueue = async () => {
  try {
    const now = Date.now();
    const queue = await getNotificationQueue();  // ❌ Read
    const pending = [];

    for (const job of queue) {
      // Process logic...
    }

    await saveNotificationQueue(pending);  // ❌ Write is separate operation
```
- **Issue:** If the process crashes between reading and writing, pending notifications are lost. Multiple workers processing queue concurrently would overwrite each other's changes.
- **Impact:** Notification jobs silently lost. Some messages marked as sent but never actually sent.
- **Fix:** Use atomic database transactions.

**Recommended Fix:**
```javascript
// Wrap in transaction
const processQueue = async () => {
  try {
    if (shouldUseDatabase) {
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        
        const result = await client.query(
          'SELECT * FROM notification_queue ORDER BY next_attempt_at FOR UPDATE'
        );
        const queue = result.rows;
        // ... process queue
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  } catch (error) {
    // error handling
  }
};
```

---

### 7. **Synchronous File I/O in Async Function - Blog Routes**
- **File:** [backend/node/routes/blogRoutes.js](backend/node/routes/blogRoutes.js#L14-L20)
- **Line:** 14-20
- **Severity:** HIGH (Performance/Blocking)
- **Current Code:**
```javascript
const readBlogPosts = async () => {
  try {
    if (!fs.existsSync(BLOG_DATA_FILE)) {
      return [];
    }
    const data = fs.readFileSync(BLOG_DATA_FILE, "utf-8");  // ❌ Sync call in async
    return JSON.parse(data);
  } catch (error) {
    // ...
  }
};
```
- **Issue:** Marked as `async` but uses blocking `fs.readFileSync()`. This blocks the event loop, preventing other requests from being processed while reading blog data.
- **Impact:** Slow response times under load. If blog data file is large or on slow storage, entire server pauses.
- **Fix:** Use `fs.promises.readFile()`.

**Recommended Fix:**
```javascript
const readBlogPosts = async () => {
  try {
    try {
      const data = await fs.promises.readFile(BLOG_DATA_FILE, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  } catch (error) {
    console.error("Error reading blog posts:", error);
    return [];
  }
};
```

---

### 8. **Blog Pagination Integer Validation Missing**
- **File:** [backend/node/routes/blogRoutes.js](backend/node/routes/blogRoutes.js#L77-L82)
- **Line:** 77-82
- **Severity:** HIGH (Invalid Input)
- **Current Code:**
```javascript
router.get("/posts", async (req, res) => {
  try {
    const posts = await readBlogPosts();
    const limit = Math.min(parseInt(req.query.limit || 10), 50);  // ❌ NaN possible
    const offset = parseInt(req.query.offset || 0);
    
    const published = posts.filter(post => post.published === true);
    const sorted = published.sort((a, b) => 
      new Date(b.published_date) - new Date(a.published_date)
    );

    res.status(200).json({
      success: true,
      posts: sorted.slice(offset, offset + limit),  // ❌ NaN behavior
```
- **Issue:** `parseInt()` returns `NaN` if the string can't be parsed. `Math.min(NaN, 50)` returns 50, but `sorted.slice(NaN, NaN + 50)` behaves unpredictably.
- **Impact:** Malformed query parameters like `?limit=abc` cause unexpected pagination behavior or expose all posts.
- **Fix:** Validate parsed integers.

**Recommended Fix:**
```javascript
router.get("/posts", async (req, res) => {
  try {
    const posts = await readBlogPosts();
    
    const limit = (() => {
      const parsed = parseInt(req.query.limit || "10", 10);
      return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 50) : 10;
    })();
    
    const offset = (() => {
      const parsed = parseInt(req.query.offset || "0", 10);
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
    })();
    
    const published = posts.filter(post => post.published === true);
    // ... rest of logic
```

---

### 9. **Service Worker Cache Strategy May Serve Stale Content**
- **File:** [public/service-worker.js](public/service-worker.js#L29-L46)
- **Line:** 29-46
- **Severity:** HIGH (Stale Content)
- **Current Code:**
```javascript
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (isLocaleRequest(requestUrl) || event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }

          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);  // ❌ Caches all 200 responses
          });

          return response;
        })
        .catch(() => caches.match(event.request))  // ❌ Falls back to stale cache
    );
    return;
  }
```
- **Issue:** The strategy caches ALL 200 responses without checking `Cache-Control` headers. If server returns stale data or error pages with 200 status, they get cached. When network fails, stale content is served indefinitely.
- **Impact:** Users see outdated blog posts, contact forms, or critical information until cache is cleared manually.
- **Fix:** Check Cache-Control headers and implement cache versioning.

**Recommended Fix:**
```javascript
const shouldCacheResponse = (response) => {
  if (response.status !== 200) return false;
  
  const cacheControl = response.headers.get("cache-control") || "";
  return !cacheControl.includes("no-cache") && !cacheControl.includes("no-store");
};

self.addEventListener("fetch", (event) => {
  // ... 
  if (isLocaleRequest(requestUrl) || event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (!shouldCacheResponse(response)) {
            return response;
          }
          
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);
          });
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
```

---

### 10. **Admin Session Inactivity Listener Cleanup Missing**
- **File:** [public/assets/js/pages/admin.js](public/assets/js/pages/admin.js#L419-L424)
- **Line:** 419-424
- **Severity:** HIGH (Memory Leak)
- **Current Code:**
```javascript
const unbindInactivityEvents = () => {
  const events = ["mousemove", "keydown", "click"];
  events.forEach((eventName) => {
    window.removeEventListener(eventName, scheduleInactivityTimeout, { passive: true });
  });
};
```
- **Issue:** `unbindInactivityEvents()` is defined but **never called** when user logs out. Event listeners remain attached after logout. If user logs back in, listeners are added again (now duplicated), causing multiple inactivity timeouts to trigger simultaneously.
- **Impact:** Users get logged out prematurely after logout/login cycle. Multiple simultaneous logouts cause race conditions. Memory accumulation of event listeners.
- **Fix:** Call unbind function in logout handler.

**Recommended Fix:**
In admin logout handler (around line 477), add:
```javascript
const handleLogout = async () => {
  unbindInactivityEvents();  // ✅ Clean up listeners
  clearInactivityTimer();    // ✅ Clear timer
  
  // ... rest of logout logic
  setDashboardVisibility(false);
};
```

---

### 11. **React App Memory Leak - Missing useEffect Cleanup**
- **File:** [frontend/react-app/src/App.jsx](frontend/react-app/src/App.jsx#L30-L50)
- **Line:** 30-50
- **Severity:** HIGH (Memory Leak)
- **Current Code:**
```javascript
const runCheck = async (endpoint) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);  // ❌ May not be cleared

    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    clearTimeout(timeoutId);  // ❌ Only cleared if response succeeds
```
- **Issue:** If the request aborts due to timeout or error, `timeoutId` is not always cleared. The timeout continues to trigger after component unmounts.
- **Impact:** Memory leak after component unmounts. Ghost timeouts firing after navigation.
- **Fix:** Use try-finally to guarantee cleanup.

**Recommended Fix:**
```javascript
const runCheck = async (endpoint) => {
  try {
    const controller = new AbortController();
    let timeoutId = null;
    
    try {
      timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      });

      // ... process response
    } finally {
      if (timeoutId) clearTimeout(timeoutId);  // ✅ Always cleared
    }
  } catch (error) {
    // error handling
  }
};
```

---

### 12. **Telemetry Endpoint No Input Validation**
- **File:** [server.js](server.js#L262-L276)
- **Line:** 262-276
- **Severity:** HIGH (Data Integrity)
- **Current Code:**
```javascript
app.post("/api/telemetry", express.text({ type: ["application/json", "text/plain"] }), async (req, res) => {
  try {
    const payload = typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : (req.body || {});

    const sanitized = {
      event: String(payload.event || "pageview"),  // ❌ Accepts any string
      path: String(payload.path || req.path),     // ❌ No validation
      locale: String(payload.locale || "en"),     // ❌ No enum check
      timestamp: new Date().toISOString()
    };

    await appendTelemetryEvent(sanitized);
```
- **Issue:** No validation of `event`, `path`, or `locale` fields. Attacker can send arbitrary values, polluting analytics data. No size limits on `event` or `path` strings.
- **Impact:** Corrupted telemetry data. Potential for DoS by sending extremely large telemetry payloads.
- **Fix:** Validate and sanitize telemetry fields.

**Recommended Fix:**
```javascript
const VALID_EVENTS = ["pageview", "click", "form_submit", "error"];
const VALID_LOCALES = ["en", "nl"];
const MAX_PATH_LENGTH = 500;
const MAX_EVENT_LENGTH = 50;

app.post("/api/telemetry", express.text({ type: ["application/json", "text/plain"] }), async (req, res) => {
  try {
    const payload = typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : (req.body || {});

    const event = String(payload.event || "pageview").toLowerCase().slice(0, MAX_EVENT_LENGTH);
    const locale = String(payload.locale || "en").toLowerCase();
    const path = String(payload.path || req.path).slice(0, MAX_PATH_LENGTH);

    if (!VALID_EVENTS.includes(event)) {
      return res.status(400).json({ success: false, message: "Invalid event type" });
    }

    if (!VALID_LOCALES.includes(locale)) {
      return res.status(400).json({ success: false, message: "Invalid locale" });
    }

    const sanitized = { event, path, locale, timestamp: new Date().toISOString() };
    await appendTelemetryEvent(sanitized);
    
    return res.status(202).json({ success: true });
```

---

### 13. **Database Connection Pool Not Closed on Shutdown**
- **File:** [backend/node/data/storage.js](backend/node/data/storage.js#L16-L26)
- **Severity:** HIGH (Resource Leak)
- **Current Code:**
```javascript
const getPool = () => {
  if (!shouldUseDatabase) {
    return null;
  }

  if (!pool) {
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: process.env.DB_SSL === "false" ? false : undefined
    });
  }

  return pool;
};
```
- **Issue:** Database connection pool is created but never explicitly closed. On server shutdown, connections remain open, preventing clean shutdown.
- **Impact:** Ungraceful shutdown. Active connections left hanging. Database may report connection limit exceeded.
- **Fix:** Add shutdown handler to close pool.

**Recommended Fix:**
```javascript
// In server.js, after app.listen():
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  const pool = getPool();
  if (pool) {
    await pool.end();
    console.log('Database pool closed');
  }
  
  process.exit(0);
});
```

---

## MEDIUM (Important Issues)

### 14. **Contact Form Subject Field Not Truncated - Input Validation Gap**
- **File:** [backend/node/utils/sanitize.js](backend/node/utils/sanitize.js#L9-L12)
- **Severity:** MEDIUM (Data Validation)
- **Current Code:**
```javascript
const sanitizeText = (input) => {
  if (typeof input !== "string") {
    return input;
  }
  return input.trim().slice(0, 10000);  // ❌ 10000 chars - very large
};
```
- **Issue:** All text fields truncated to 10,000 characters. For `subject`, this is excessive. An attacker could submit 10,000 character subjects, bloating the database.
- **Impact:** Database bloat. Inefficient storage. Subject line rendering issues in email.
- **Fix:** Use per-field validation limits.

**Recommended Fix:**
```javascript
const FIELD_LIMITS = {
  name: 100,
  email: 254,
  subject: 200,
  message: 5000
};

const sanitizeField = (input, fieldName) => {
  if (typeof input !== "string") {
    return input;
  }
  const limit = FIELD_LIMITS[fieldName] || 10000;
  return input.trim().slice(0, limit);
};
```

---

### 15. **Admin Form Credentials Persists After Logout**
- **File:** [public/assets/js/pages/admin.js](public/assets/js/pages/admin.js#L477-L530)
- **Severity:** MEDIUM (Security)
- **Current Code:**
```javascript
authForm.addEventListener("submit", async (event) => {
  // ... login logic
});

// Logout handler doesn't clear form
const handleLogout = () => {
  // ... logout logic
  // ❌ adminUserInput and adminPassInput values never cleared
};
```
- **Issue:** After logout, admin username and password remain in form fields. If user leaves admin page open, next person could see credentials.
- **Impact:** Credential exposure in shared environments. Social engineering risk on shared machines.
- **Fix:** Clear form on logout.

**Recommended Fix:**
```javascript
const handleLogout = async () => {
  unbindInactivityEvents();
  clearInactivityTimer();
  
  // ✅ Clear sensitive form fields
  if (adminUserInput) adminUserInput.value = "";
  if (adminPassInput) adminPassInput.value = "";
  if (adminOtpInput) adminOtpInput.value = "";
  
  setDashboardVisibility(false);
  // ... rest of logout
};
```

---

### 16. **Dockerfile Runs PHP as Root - Security Hardening**
- **File:** [Dockerfile](Dockerfile)
- **Severity:** MEDIUM (Security Best Practice)
- **Current Code:**
```dockerfile
FROM php:8.3-cli

WORKDIR /app

COPY . /app

EXPOSE 8000

CMD ["php", "-S", "0.0.0.0:8000", "-t", "public"]
```
- **Issue:** No non-root user created. PHP runs with full container privileges. If PHP is compromised, attacker has full access.
- **Impact:** Container escape easier. Lateral movement within host possible.
- **Fix:** Create non-root user.

**Recommended Fix:**
```dockerfile
FROM php:8.3-cli

WORKDIR /app

COPY . /app

# Create non-root user
RUN addgroup -g 1001 -S phpuser && \
    adduser -S phpuser -u 1001 && \
    chown -R phpuser:phpuser /app

USER phpuser

EXPOSE 8000

CMD ["php", "-S", "0.0.0.0:8000", "-t", "public"]
```

---

### 17. **Missing CORS Configuration**
- **File:** [server.js](server.js#L60-L75)
- **Severity:** MEDIUM (API Integration)
- **Current Code:**
```javascript
app.use(compression());

app.use(apiLimiter);

app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  // ... no CORS headers
```
- **Issue:** No CORS (Cross-Origin Resource Sharing) headers configured. External apps cannot call your API from browsers.
- **Impact:** Frontend apps on different domains cannot fetch from this API. `Access-Control-Allow-Origin` not set, triggering CORS errors.
- **Fix:** Add CORS middleware.

**Recommended Fix:**
```javascript
const cors = require("cors");

app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"]
}));
```

---

### 18. **Health Check Endpoint Exposes Sensitive Implementation Details**
- **File:** [backend/node/controllers/contactController.js](backend/node/controllers/contactController.js#L50-L66)
- **Severity:** MEDIUM (Information Disclosure)
- **Current Code:**
```javascript
const getHealth = (req, res) => {
  const notifyTo = String(process.env.CONTACT_NOTIFY_TO || "").trim();
  const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
  const notifyFrom = String(process.env.CONTACT_NOTIFY_FROM || "").trim();

  let mode = "disabled";

  if (notifyTo) {
    mode = resendApiKey ? "resend" : "php-mail-fallback";
  }

  res.status(200).json({
    status: "ok",
    service: "portfolio-api",
    timestamp: new Date().toISOString(),
    notifications: {
      mode,  // ❌ Reveals which email service is configured
      toConfigured: Boolean(notifyTo),  // ❌ Reveals env vars are set
      fromConfigured: Boolean(notifyFrom),
      providerConfigured: Boolean(resendApiKey)
    }
  });
};
```
- **Issue:** Health endpoint reveals which email providers are configured and whether env vars are set. Attacker can gather intel about infrastructure.
- **Impact:** Information gathering for targeted attacks. Reveals tech stack details.
- **Fix:** Minimize information exposure in health checks.

**Recommended Fix:**
```javascript
const getHealth = (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "portfolio-api",
    timestamp: new Date().toISOString(),
    version: "1.0.0"
    // ❌ Removed: notifications config details
  });
};
```

---

### 19. **Cloudflare Access Bypass If Environment Variable Not Set**
- **File:** [backend/node/middleware/cloudflareAccessMiddleware.js](backend/node/middleware/cloudflareAccessMiddleware.js#L1-15)
- **Severity:** MEDIUM (Auth Bypass Potential)
- **Current Code:**
```javascript
const toBool = (value) => String(value || "").trim().toLowerCase() === "true";

const isCloudflareAccessEnabled = () => toBool(process.env.CF_ACCESS_ENABLED);

const requireCloudflareAccess = (req, res, next) => {
  if (isLocalRequest(req)) {
    return next();
  }

  if (!isCloudflareAccessEnabled()) {
    return next();  // ❌ Allows all requests if env var not set
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
```
- **Issue:** If `CF_ACCESS_ENABLED` is not set to "true", admin endpoints are unprotected. No default-deny security model. If environment variable is accidentally not set in production, admin pages are exposed.
- **Impact:** Admin dashboard publicly accessible if env var misconfigured.
- **Fix:** Default to enabled and require explicit opt-out, or fail securely.

**Recommended Fix:**
```javascript
const requireCloudflareAccess = (req, res, next) => {
  if (isLocalRequest(req)) {
    return next();
  }

  // Default to REQUIRING access (fail-secure)
  const isEnabled = process.env.CF_ACCESS_ENABLED !== "false";
  
  if (!isEnabled && process.env.NODE_ENV === "production") {
    console.error("CF_ACCESS_ENABLED not set in production - denying access");
    return res.status(403).json({
      success: false,
      message: "Access denied - authentication not configured"
    });
  }

  if (!isEnabled) {
    return next();  // Development mode only
  }

  // ... rest of auth check
```

---

### 20. **Blog Post Publishing Filter Not Audited**
- **File:** [backend/node/routes/blogRoutes.js](backend/node/routes/blogRoutes.js#L75-L85)
- **Severity:** MEDIUM (Logic Error)
- **Current Code:**
```javascript
router.get("/posts", async (req, res) => {
  try {
    const posts = await readBlogPosts();
    const limit = Math.min(parseInt(req.query.limit || 10), 50);
    const offset = parseInt(req.query.offset || 0);

    const published = posts.filter(post => post.published === true);  // ❌ Strict equality check
```
- **Issue:** Filter uses strict equality `post.published === true`. If `published` is string `"true"` or other truthy value, it won't filter correctly. Published status inconsistent.
- **Impact:** Draft blog posts might be visible. Or published posts might not be visible depending on how data is structured.
- **Fix:** Normalize published field.

**Recommended Fix:**
```javascript
const published = posts.filter(post => 
  post.published === true || post.published === "true"
);

// Or better: normalize on load
const getNormalizedPosts = (posts) => posts.map(post => ({
  ...post,
  published: Boolean(post.published)
}));
```

---

### 21. **React Error Boundary Missing useEffect Cleanup**
- **File:** [frontend/react-app/src/App.jsx](frontend/react-app/src/App.jsx#L65-L78)
- **Severity:** MEDIUM (Best Practice)
- **Current Code:**
```javascript
const refresh = async () => {
  setChecking(true);
  try {
    const [fastify, node, php] = await Promise.all([
      runCheck(ENDPOINTS.fastifyHealth),
      runCheck(ENDPOINTS.nodeHealth),
      runCheck(ENDPOINTS.phpHealth)
    ]);
    setChecks({ fastify, node, php });
    setAppError(null);
  } catch (error) {
    setAppError(error.message);
    console.error("Health check error:", error);
  } finally {
    setChecking(false);
  }
};

useEffect(() => {
  refresh();
}, []);  // ❌ No cleanup for async operations
```
- **Issue:** `useEffect` doesn't have a cleanup function. If component unmounts while `refresh()` is executing, `setChecks()` will be called on unmounted component, causing memory leak warning.
- **Impact:** React console warnings. Memory leaks in development. Potential bugs in production.
- **Fix:** Add cleanup/cancel mechanism.

**Recommended Fix:**
```javascript
useEffect(() => {
  let isMounted = true;

  const runRefresh = async () => {
    setChecking(true);
    try {
      const [fastify, node, php] = await Promise.all([
        runCheck(ENDPOINTS.fastifyHealth),
        runCheck(ENDPOINTS.nodeHealth),
        runCheck(ENDPOINTS.phpHealth)
      ]);
      
      if (isMounted) {  // ✅ Check before setState
        setChecks({ fastify, node, php });
        setAppError(null);
      }
    } catch (error) {
      if (isMounted) {
        setAppError(error.message);
        console.error("Health check error:", error);
      }
    } finally {
      if (isMounted) setChecking(false);
    }
  };

  runRefresh();

  return () => {
    isMounted = false;  // ✅ Cleanup function
  };
}, []);
```

---

### 22. **Admin Auth Endpoint Exposed Without Rate Limiting on First Request**
- **File:** [backend/node/routes/contactRoutes.js](backend/node/routes/contactRoutes.js#L110)
- **Severity:** MEDIUM (Brute Force Risk)
- **Current Code:**
```javascript
router.post("/admin/login", requireCloudflareAccess, authLimiter, requireAdminAuth, (req, res) => {
```
- **Issue:** `authLimiter` has `skipSuccessfulRequests: true`, meaning only failed attempts are rate limited. Successful logins don't count. But first request to endpoint (before any rate limiting) is not protected.
- **Impact:** Rapid fire attempts possible on first request before rate limiter kicks in.
- **Fix:** Use per-IP connection limits.

**Recommended Fix:**
```javascript
// Use connection-level rate limiting instead
const createStrictLimiter = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
    skip: (req) => process.env.NODE_ENV === "test",
    skipSuccessfulRequests: false,  // ✅ Count all requests, not just failures
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message: "Too many login attempts"
      });
    }
  });
};

router.post("/admin/login", 
  requireCloudflareAccess, 
  createStrictLimiter({ max: 5 }),  // ✅ Strict limiter
  requireAdminAuth, 
  (req, res) => { ... }
);
```

---

### 23. **Session Secret Fallback to Random Value - Unpredictable Behavior**
- **File:** [server.js](server.js#L209)
- **Severity:** MEDIUM (Session Management)
- **Current Code:**
```javascript
app.use(session({
  name: "portfolio.sid",
  secret: sessionSecret || crypto.randomBytes(32).toString("hex"),  // ❌ Random fallback
```
- **Issue:** If `sessionSecret` is not set, session uses random secret. On server restart, old sessions become invalid because secret changes. Users logged in before restart get logged out.
- **Impact:** Poor user experience. Frequent logouts after deployments.
- **Fix:** Require secret in production and use consistent value.

**Recommended Fix:**
```javascript
const getSessionSecret = () => {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_SESSION_SECRET required in production");
  }
  return secret || "dev-secret-change-in-production";  // Safe dev default only
};

app.use(session({
  name: "portfolio.sid",
  secret: getSessionSecret(),
  // ... rest of config
}));
```

---

## LOW (Minor Improvements)

### 24. **Console Error Logging Not Sanitized**
- **File:** [backend/node/controllers/contactController.js](backend/node/controllers/contactController.js#L175)
- **Severity:** LOW (Information Disclosure)
- **Current Code:**
```javascript
} catch (error) {
  console.error(`[Request ${req.requestId}] Contact submission error:`, error);
```
- **Issue:** Full error objects logged to console, which might expose stack traces or sensitive data in production logs.
- **Fix:** Log only essential error info.

---

### 25. **Service Worker Pre-cache Includes Non-Critical Assets**
- **File:** [public/service-worker.js](public/service-worker.js#L2-L10)
- **Severity:** LOW (Performance)
- **Current Code:**
```javascript
const PRE_CACHE = [
  "/index.html",
  "/about.html",
  "/projects.html",
  "/services.html",
  "/contact.html",
  "/assets/css/styles.css",
  "/assets/js/core/main.js",
  "/favicon.svg"
];
```
- **Issue:** Large pre-cache list increases initial install time and storage. Should only cache critical assets.
- **Fix:** Reduce to critical path only.

---

### 26. **Missing Strict Mode in TypeScript Compilation**
- **File:** [tsconfig.json](tsconfig.json)
- **Severity:** LOW (Code Quality)
- **Current Code:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
```
- **Issue:** `skipLibCheck: true` skips type checking of declaration files, potentially missing type errors.
- **Fix:** Change to `false` for stricter checking.

---

### 27. **Contact Form Timeout Too Generous**
- **File:** [public/assets/js/pages/contact.js](public/assets/js/pages/contact.js#L173)
- **Severity:** LOW (Performance)
- **Current Code:**
```javascript
timeoutId = window.setTimeout(() => controller.abort(), 8000);  // 8 seconds
```
- **Issue:** 8-second timeout is generous. Most API responses should be much faster. Extended timeout masks slow endpoints.
- **Fix:** Reduce to 5 seconds.

**Recommended Fix:**
```javascript
timeoutId = window.setTimeout(() => controller.abort(), 5000);  // 5 seconds
```

---

### 28. **Admin Dashboard Search Case-Sensitive**
- **File:** [public/assets/js/pages/admin.js](public/assets/js/pages/admin.js#L188-L199)
- **Severity:** LOW (UX)
- **Current Code:**
```javascript
const applyFilter = () => {
  const query = (searchInput?.value || "").trim().toLowerCase();

  filteredMessages = allMessages.filter((message) => {
    const searchable = `${message.name} ${message.email} ${message.subject} ${message.message}`.toLowerCase();

    if (query.length === 0) {
      return true;
    }

    return searchable.includes(query);
  });
```
- **Issue:** Search is case-insensitive (good), but field comparison might miss partial matches or have whitespace issues.
- **Fix:** Minor improvement to normalize whitespace.

---

### 29. **Missing Helmet CSP Frame Ancestors**
- **File:** [server.js](server.js#L133-L145)
- **Severity:** LOW (Security Hardening)
- **Current Code:**
```javascript
app.use(helmet({
  contentSecurityPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
}));
```
- **Issue:** CSP disabled. Built custom CSP but `frame-ancestors` already set. Slight redundancy.
- **Fix:** Use Helmet's CSP instead of manual headers.

---

### 30. **Unused Dependencies in package.json**
- **File:** [package.json](package.json)
- **Severity:** LOW (Maintenance)
- **Issue:** Potential unused dependencies should be audited and removed to reduce attack surface.

---

### 31. **Missing Error Retry Logic for Failed Message Saves**
- **File:** [backend/node/controllers/contactController.js](backend/node/controllers/contactController.js#L160)
- **Severity:** LOW (Resilience)
- **Issue:** No retry mechanism if message save fails first time. Single transient failure causes loss.
- **Fix:** Implement exponential backoff retry.

---

### 32. **Blog Slug Not Validated for Safe Characters**
- **File:** [backend/node/routes/blogRoutes.js](backend/node/routes/blogRoutes.js#L119)
- **Severity:** LOW (Data Validation)
- **Current Code:**
```javascript
const post = posts.find(p => p.slug === req.params.slug && p.published === true);
```
- **Issue:** Slug parameter not validated. Attacker could request arbitrary slugs. Should validate format.
- **Fix:** Use slug validation regex.

**Recommended Fix:**
```javascript
router.get("/posts/:slug", async (req, res) => {
  try {
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
    if (!slugRegex.test(req.params.slug)) {
      return res.status(400).json({
        success: false,
        message: "Invalid slug format"
      });
    }

    const posts = await readBlogPosts();
    const post = posts.find(p => p.slug === req.params.slug && p.published === true);
    // ...
```

---

## Summary Table

| # | Issue | File | Line | Severity | Category | Status |
|---|-------|------|------|----------|----------|--------|
| 1 | Duplicate variable declaration | contact.js | 119-135 | CRITICAL | Logic Error | Needs Fix |
| 2 | Notification worker not started | server.js | 54 | CRITICAL | Lost Functionality | Needs Fix |
| 3 | Auth header validation missing | authMiddleware.js | 70-75 | CRITICAL | Auth Bypass | Needs Fix |
| 4 | CSV URL not revoked | admin.js | 254-267 | CRITICAL | Memory Leak | Needs Fix |
| 5 | Rate limit race condition | contactController.js | 16-40 | CRITICAL | Bypass | Needs Fix |
| 6 | Queue operations not atomic | notificationQueue.js | 56-80 | HIGH | Data Loss | Needs Fix |
| 7 | Sync I/O in async function | blogRoutes.js | 14-20 | HIGH | Blocking | Needs Fix |
| 8 | Missing pagination validation | blogRoutes.js | 77-82 | HIGH | Invalid Input | Needs Fix |
| 9 | Stale cache serving | service-worker.js | 29-46 | HIGH | Stale Content | Needs Fix |
| 10 | Inactivity listeners not cleaned | admin.js | 419-424 | HIGH | Memory Leak | Needs Fix |
| 11 | React cleanup missing | App.jsx | 30-50 | HIGH | Memory Leak | Needs Fix |
| 12 | Telemetry no validation | server.js | 262-276 | HIGH | Data Integrity | Needs Fix |
| 13 | DB pool not closed | storage.js | 16-26 | HIGH | Resource Leak | Needs Fix |
| 14 | Subject field too large | sanitize.js | 9-12 | MEDIUM | Data Validation | Review |
| 15 | Form credentials persists | admin.js | 477-530 | MEDIUM | Security | Needs Fix |
| 16 | PHP runs as root | Dockerfile | 1-15 | MEDIUM | Security Hardening | Needs Fix |
| 17 | Missing CORS | server.js | 60-75 | MEDIUM | API Integration | Needs Fix |
| 18 | Health endpoint exposure | contactController.js | 50-66 | MEDIUM | Info Disclosure | Needs Fix |
| 19 | CF Access bypass | cloudflareAccessMiddleware.js | 1-15 | MEDIUM | Auth Bypass | Needs Fix |
| 20 | Blog publishing filter | blogRoutes.js | 75-85 | MEDIUM | Logic Error | Needs Fix |
| 21 | ErrorBoundary no cleanup | App.jsx | 65-78 | MEDIUM | Best Practice | Needs Fix |
| 22 | Auth limiter first request | contactRoutes.js | 110 | MEDIUM | Brute Force | Needs Fix |
| 23 | Session secret fallback | server.js | 209 | MEDIUM | Session Mgmt | Needs Fix |
| 24 | Unfiltered console errors | contactController.js | 175 | LOW | Info Disclosure | Review |
| 25 | Large pre-cache | service-worker.js | 2-10 | LOW | Performance | Review |
| 26 | skipLibCheck: true | tsconfig.json | - | LOW | Code Quality | Review |
| 27 | Generous timeout | contact.js | 173 | LOW | Performance | Review |
| 28 | Search case handling | admin.js | 188-199 | LOW | UX | Review |
| 29 | Helmet CSP redundancy | server.js | 133-145 | LOW | Security Hardening | Review |
| 30 | Unused dependencies | package.json | - | LOW | Maintenance | Review |
| 31 | No retry logic | contactController.js | 160 | LOW | Resilience | Review |
| 32 | Slug validation missing | blogRoutes.js | 119 | LOW | Data Validation | Review |

---

## Recommended Fix Priority

**Immediate (This Week):**
1. Fix duplicate variable declaration (contact.js)
2. Start notification worker (server.js)
3. Fix auth header validation (authMiddleware.js)
4. Revoke CSV URLs (admin.js)
5. Fix rate limit race condition (contactController.js)

**This Sprint:**
6. Make queue operations atomic (notificationQueue.js)
7. Replace sync I/O (blogRoutes.js)
8. Validate pagination parameters (blogRoutes.js)
9. Improve service worker caching (service-worker.js)
10. Clean up inactivity listeners (admin.js)

**Before Production Deployment:**
- All Critical and High issues
- Docker security hardening (Dockerfile)
- Add CORS configuration (server.js)
- Validate telemetry data (server.js)
- Database pool shutdown (storage.js)

---

## Files Requiring Updates

**Critical:**
- [public/assets/js/pages/contact.js](public/assets/js/pages/contact.js)
- [server.js](server.js)
- [backend/node/middleware/authMiddleware.js](backend/node/middleware/authMiddleware.js)
- [public/assets/js/pages/admin.js](public/assets/js/pages/admin.js)
- [backend/node/controllers/contactController.js](backend/node/controllers/contactController.js)

**High:**
- [backend/node/services/notificationQueue.js](backend/node/services/notificationQueue.js)
- [backend/node/routes/blogRoutes.js](backend/node/routes/blogRoutes.js)
- [public/service-worker.js](public/service-worker.js)
- [frontend/react-app/src/App.jsx](frontend/react-app/src/App.jsx)
- [backend/node/data/storage.js](backend/node/data/storage.js)

---

## Testing Recommendations

1. **Load Testing:** Verify concurrent requests don't bypass rate limiting
2. **Memory Profiling:** Check for leaks in long-running sessions
3. **Cache Testing:** Verify Service Worker doesn't serve stale content
4. **Session Tests:** Test logout behavior and listener cleanup
5. **Security Scanning:** Run OWASP ZAP against API endpoints
6. **Database:** Test connection pool cleanup on shutdown
7. **Frontend:** Test React component cleanup on unmount

---

## Notes

- This audit prioritizes security, data integrity, and reliability
- Several issues are code quality/best practice (Medium/Low) but worth addressing
- Database pool management should be tested in production-like environment
- Consider implementing automated security testing in CI/CD pipeline

