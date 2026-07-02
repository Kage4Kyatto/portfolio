# Security & Optimization Audit Report
**Date:** 2026-06-23

---

## 🔴 CRITICAL ISSUES

### 1. **Session Secret Default is Insecure**
**File:** [server.js](server.js#L143)
**Severity:** CRITICAL
**Issue:** Default session secret is `"change-this-session-secret"` which will be used if `ADMIN_SESSION_SECRET` is not set in production.

```javascript
cookie: {
  // BAD - Using insecure default even when env var missing
  secret: process.env.ADMIN_SESSION_SECRET || "change-this-session-secret",
```

**Fix:** Require session secret in production
```javascript
const sessionSecret = process.env.ADMIN_SESSION_SECRET;
if (process.env.NODE_ENV === "production" && !sessionSecret) {
  throw new Error("ADMIN_SESSION_SECRET must be set in production");
}

app.use(session({
  name: "portfolio.sid",
  secret: sessionSecret || crypto.randomBytes(32).toString("hex"),
```

---

### 2. **Unsafe-Inline CSS in Content Security Policy**
**File:** [server.js](server.js#L85-L94)
**Severity:** CRITICAL
**Issue:** CSP allows `'unsafe-inline'` for styles, defeating the purpose of CSP protection.

**Current:**
```javascript
"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
```

**Fix:** Move inline styles to separate CSS files or use nonce
```javascript
// Generate nonce per request (add to buildContentSecurityPolicy)
const nonce = crypto.randomBytes(16).toString("hex");
res.locals.nonce = nonce; // Make available to templates

"style-src 'self' https://fonts.googleapis.com `nonce-${nonce}`",
```

---

### 3. **Weak Default Rate Limit Configuration**
**File:** [backend/node/utils/rateLimiter.js](backend/node/utils/rateLimiter.js#L16)
**Severity:** HIGH
**Issue:** Default `contactLimiter` allows 5 requests/hour but code in contactController suggests 8/15min window. Inconsistency can lead to bypasses.

**Current Issues:**
- rateLimiter.js: 5 requests per 1 hour
- contactController.js: 8 requests per 15 minutes  
- contact.php: 5 requests per 10 minutes

**Fix:** Unify and strengthen:
```javascript
const limiterConfig = {
  contact: {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 3,                      // Reduced from 5/8 for security
    message: "Too many contact submissions, please try again later.",
    keyGenerator: (req) => getClientIp(req)  // Use consistent IP extraction
  },
  // ...
};
```

---

## 🟠 HIGH PRIORITY ISSUES

### 4. **Race Condition in Notification Queue Processing**
**File:** [backend/node/services/notificationQueue.js](backend/node/services/notificationQueue.js#L31)
**Severity:** HIGH
**Issue:** `appendDeadLetter()` uses synchronous file I/O which can block the event loop and cause race conditions when multiple notifications fail simultaneously.

**Fix:** Convert to async operations
```javascript
const appendDeadLetter = async (entry) => {
  try {
    let items = await fs.promises.readFile(deadLetterPath, "utf8")
      .then(f => JSON.parse(f || "[]"))
      .catch(() => []);
    
    items.push({ ...entry, failedAt: new Date().toISOString() });
    
    // Keep only last 1000 entries instead of 500
    if (items.length > 1000) {
      items = items.slice(-1000);
    }
    
    await fs.promises.writeFile(
      deadLetterPath, 
      JSON.stringify(items, null, 2)
    );
  } catch (error) {
    console.error("[DeadLetter] Failed to append:", error);
  }
};

// Update processQueue to await appendDeadLetter
const processQueue = async () => {
  try {
    // ... existing code ...
    if (nextAttempts >= maxAttempts) {
      queueMetrics.totalFailed++;
      await appendDeadLetter({  // ADD await HERE
        ...job,
        failedAt: new Date().toISOString(),
        reason: "Max retry attempts reached"
      });
      return;
    }
    // ...
  } catch (error) {
    // ...
  }
};
```

---

### 5. **Missing Secure Cookie Flags**
**File:** [server.js](server.js#L143-L154)
**Severity:** HIGH
**Issue:** Session cookie missing `Secure` and `SameSite` flags for CSRF/session hijacking protection.

**Current:**
```javascript
cookie: {
  httpOnly: true,
  maxAge: 24 * 60 * 60 * 1000
}
```

**Fix:** Add security flags
```javascript
cookie: {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production", // HTTPS only in prod
  sameSite: "strict",  // Prevent CSRF
  maxAge: 24 * 60 * 60 * 1000,
  domain: process.env.COOKIE_DOMAIN || undefined
}
```

---

### 6. **Unbounded Dead Letter Queue**
**File:** [backend/node/services/notificationQueue.js](backend/node/services/notificationQueue.js#L18-L26)
**Severity:** HIGH  
**Issue:** Dead letter file can grow indefinitely if not monitored. Current cap of 500 is arbitrary and no cleanup policy exists.

**Fix:** Implement rotation with date-based separation
```javascript
const getDeadLetterPath = () => {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(__dirname, "..", "..", "php", "data", `notification_dead_letter_${date}.json`);
};

const appendDeadLetter = async (entry) => {
  try {
    const deadLetterPath = getDeadLetterPath();
    const items = await fs.promises.readFile(deadLetterPath, "utf8")
      .then(f => JSON.parse(f || "[]"))
      .catch(() => []);
    
    items.push({ ...entry, failedAt: new Date().toISOString() });
    
    // Keep only last 1000 entries per day
    const limited = items.slice(-1000);
    await fs.promises.writeFile(
      deadLetterPath,
      JSON.stringify(limited, null, 2)
    );
  } catch (error) {
    console.error("[DeadLetter] Failed to append:", error);
  }
};
```

---

### 7. **No Input Validation in React App**
**File:** [frontend/react-app/src/App.jsx](frontend/react-app/src/App.jsx#L27)
**Severity:** MEDIUM-HIGH
**Issue:** Component has no error boundary and fetch errors are silently caught with no user feedback.

**Fix:** Add error boundary and proper error handling
```jsx
import { useEffect, useState } from "react";
import ErrorBoundary from "./components/ErrorBoundary";

const ENDPOINTS = {
  fastifyHealth: import.meta.env.VITE_FASTIFY_HEALTH_PATH || "/bridge/fastify/health",
  nodeHealth: import.meta.env.VITE_NODE_HEALTH_PATH || "/bridge/node/api/health",
  phpHealth: import.meta.env.VITE_PHP_HEALTH_PATH || "/bridge/php/api/health.php"
};

const createInitialState = () => ({
  status: "idle",
  detail: "Not checked yet",
  lastError: null
});

export default function App() {
  const [checks, setChecks] = useState({
    fastify: createInitialState(),
    node: createInitialState(),
    php: createInitialState()
  });
  const [checking, setChecking] = useState(false);
  const [appError, setAppError] = useState(null);

  const runCheck = async (endpoint) => {
    try {
      const response = await fetch(endpoint, { 
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000)  // 5 second timeout
      });
      const bodyText = await response.text();

      if (!response.ok) {
        return {
          status: "error",
          detail: `HTTP ${response.status}`,
          lastError: `Server returned ${response.status}`
        };
      }

      let parsed = null;
      try {
        parsed = bodyText ? JSON.parse(bodyText) : null;
      } catch (e) {
        return {
          status: "error",
          detail: "Invalid JSON response",
          lastError: e.message
        };
      }

      const serviceName = parsed?.service || parsed?.runtime || "healthy";
      return {
        status: "ok",
        detail: `${serviceName}`
      };
    } catch (error) {
      return {
        status: "error",
        detail: error instanceof TypeError ? "connection refused" : "unreachable",
        lastError: error.message
      };
    }
  };

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
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <ErrorBoundary>
      <main className="app-shell">
        {appError && (
          <div className="alert alert-error">
            <strong>Error:</strong> {appError}
          </div>
        )}
        <section className="card">
          <p className="eyebrow">React Admin Dashboard</p>
          <h1>Framework Health Overview</h1>
          <p>
            This route is mounted under /app and gives you a React-powered overview of Fastify, Node,
            and PHP runtime health.
          </p>

          <div className="grid">
            <StatusCard label="Fastify" value={checks.fastify} />
            <StatusCard label="Node" value={checks.node} />
            <StatusCard label="PHP" value={checks.php} />
          </div>

          <button 
            onClick={refresh} 
            disabled={checking}
            aria-busy={checking}
          >
            {checking ? "Checking..." : "Refresh Status"}
          </button>
        </section>
      </main>
    </ErrorBoundary>
  );
}
```

---

## 🟡 MEDIUM PRIORITY ISSUES

### 8. **Inconsistent Error Handling Across Backends**
**Files:** Multiple
**Severity:** MEDIUM
**Issue:** Error responses don't include consistent error codes or correlation IDs for debugging.

**Fix Example for Node:**
```javascript
const submitContact = async (req, res) => {
  try {
    // ... validation code ...
    const newMessage = await addMessage({
      name: sanitizedName,
      email: sanitizedEmail,
      subject: sanitizedSubject,
      message: sanitizedMessage,
      createdAt: new Date().toISOString()
    });
    
    enqueueNotification({
      type: "contact_message",
      messageId: newMessage.id,
      createdAt: newMessage.createdAt
    }).catch((error) => {
      console.error(`[Request ${req.requestId}] Notification queue failed:`, error);
      // Don't fail the response - notification is best-effort
    });

    return res.status(201).json({
      success: true,
      message: "Message received successfully.",
      requestId: req.requestId,  // ADD THIS
      data: newMessage
    });
  } catch (error) {
    console.error(`[Request ${req.requestId}] Contact submit failed:`, error);
    return res.status(500).json({
      success: false,
      message: "Failed to process contact request.",
      requestId: req.requestId,  // ADD THIS
      errorCode: "CONTACT_SUBMIT_ERROR"  // ADD THIS
    });
  }
};
```

---

### 9. **No Pagination for Message Retrieval**
**File:** [backend/node/data/storage.js](backend/node/data/storage.js#L125)
**Severity:** MEDIUM
**Issue:** `getMessages()` loads all messages into memory. With thousands of messages, this causes memory bloat and slow responses.

**Fix:** Add pagination support
```javascript
const getMessages = async (limit = 50, offset = 0) => {
  return useDbOrJson(
    (db) => db.query(
      `SELECT id, name, email, subject, message, created_at 
       FROM contact_messages 
       ORDER BY id DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ).then((result) => ({
      data: result.rows.map(row => ({
        id: Number(row.id),
        name: row.name,
        email: row.email,
        subject: row.subject,
        message: row.message,
        createdAt: new Date(row.created_at).toISOString()
      })),
      total: Number(result.rows[0]?.total || 0),
      limit,
      offset
    })),
    async () => {
      const allMessages = await readJsonFile(messagesPath, []);
      const total = allMessages.length;
      const data = allMessages
        .sort((a, b) => b.id - a.id)  // Newest first
        .slice(offset, offset + limit);
      return { data, total, limit, offset };
    }
  );
};
```

---

### 10. **Docker Compose Uses Development Configuration**
**File:** [docker-compose.yml](docker-compose.yml)
**Severity:** MEDIUM
**Issue:** Running `npm install` inside container on every start is slow and should be in build layer. Missing health checks.

**Fix:** Use production-ready Docker setup
```yaml
services:
  php:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      NODE_ENV: production
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health.php"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  node:
    build:
      context: .
      dockerfile: Dockerfile.node
      target: production  # Use multi-stage build
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

Create `Dockerfile.node`:
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:22-alpine AS production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

---

### 11. **Contact Form Sends to Multiple Endpoints**
**File:** [public/assets/js/pages/contact.js](public/assets/js/pages/contact.js#L63-L70)
**Severity:** MEDIUM
**Issue:** Form attempts to send to multiple backends (Fastify, Node, PHP) which:
- Creates duplicate entries
- Increases latency
- Makes error handling complex

**Fix:** Use single primary endpoint with fallback
```javascript
// At the end of contact.js form submission handler:
const submitToEndpoint = async (endpoint, payload) => {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    throw error;
  }
};

// Use single endpoint with explicit fallback
const getPrimaryEndpoint = () => {
  const fastifyUrl = window.PORTFOLIO_FASTIFY_URL?.trim();
  if (fastifyUrl && window.location.hostname !== "localhost") {
    return `${fastifyUrl.replace(/\/$/, "")}/contact`;
  }
  return "/api/contact"; // Fallback to Node.js Express
};

try {
  const response = await submitToEndpoint(getPrimaryEndpoint(), payload);
  // ... handle success ...
} catch (error) {
  notice.className = "notice error";
  notice.textContent = t("contact_error", "Failed to send message. Please try again.");
}
```

---

## 🟢 LOW PRIORITY OPTIMIZATIONS

### 12. **Add Database Indexes for IP-Based Queries**
**File:** [backend/node/data/storage.js](backend/node/data/storage.js#L59-L98)
**Severity:** LOW
**Issue:** Queries on `ip` field without indexes will be slow as table grows.

**Fix:** Add to database initialization
```javascript
const ensureDb = async () => {
  if (!shouldUseDatabase) return false;
  
  if (!initPromise) {
    const db = getPool();
    initPromise = (async () => {
      // ... existing CREATE TABLE statements ...
      
      // Add these indexes
      await db.query(`CREATE INDEX IF NOT EXISTS idx_contact_rate_limits_ip ON contact_rate_limits(ip)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_auth_attempts_ip ON admin_auth_attempts(ip)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages(created_at DESC)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_notification_queue_next_attempt ON notification_queue(next_attempt_at)`);
    })();
  }

  await initPromise;
  return true;
};
```

---

### 13. **Rate Limiter Uses Deprecated Request Property**
**File:** [backend/node/utils/rateLimiter.js](backend/node/utils/rateLimiter.js#L18)
**Severity:** LOW
**Issue:** `req.ip` is unreliable behind proxies; code already has `getClientIp()` utility.

**Fix:** Use consistent IP extraction
```javascript
const { getClientIp } = require('./getClientIp');

const createLimiter = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 100,
    message: options.message || "Too many requests, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return options.keyGenerator ? options.keyGenerator(req) : getClientIp(req);
    },
    // ... rest of config
  });
};
```

---

### 14. **Missing Service Worker Error Handling**
**File:** [public/assets/js/core/main.js](public/assets/js/core/main.js#L52-L60)
**Severity:** LOW
**Issue:** Service worker registration errors are silently ignored with no metrics.

**Fix:** Add proper logging
```javascript
const registerServiceWorker = async () => {
  if (!("serviceWorker" in navigator)) {
    console.debug("Service Workers not supported");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("/service-worker.js");
    console.info("Service Worker registered:", registration.scope);
    
    // Check for updates periodically
    setInterval(() => {
      registration.update().catch(err => {
        console.warn("Service Worker update check failed:", err);
      });
    }, 60000); // Every minute
  } catch (error) {
    console.warn("Service Worker registration failed:", error.message);
    // App continues without PWA features
  }
};
```

---

### 15. **Translation File Not Cached**
**File:** [public/assets/js/pages/contact.js](public/assets/js/pages/contact.js#L8-L16)
**Severity:** LOW
**Issue:** Translation files fetched with `cache: "no-store"` which defeats browser caching.

**Fix:** Use proper cache headers and strategy
```javascript
const loadLocaleDictionary = async (locale) => {
  try {
    // Use cache: 'default' to respect Cache-Control headers
    const response = await fetch(`/assets/i18n/${locale}.json`);
    if (!response.ok) {
      console.warn(`Failed to load locale ${locale}: ${response.status}`);
      return;
    }

    localeDictionary = await response.json();
  } catch (error) {
    console.warn(`Error loading locale ${locale}:`, error);
    // Ignore translation loading errors and keep fallback text
  }
};
```

Make sure your web server sets proper cache headers:
```
Cache-Control: public, max-age=86400, immutable
```

---

## 📋 Summary of Changes

| Priority | Count | Impact |
|----------|-------|--------|
| 🔴 Critical | 3 | Security: Session secrets, CSP, Rate limits |
| 🟠 High | 4 | Stability: Race conditions, Cookie flags, Dead letter queue, Error handling |
| 🟡 Medium | 4 | Quality: Pagination, Docker, Form handling, Error codes |
| 🟢 Low | 4 | Performance: Indexes, SW caching, Translation caching, SW errors |

---

## 🚀 Implementation Checklist

- [ ] Set `ADMIN_SESSION_SECRET` environment variable in production
- [ ] Implement CSP nonce generation for styles
- [ ] Unify rate limiting across PHP/Node/Fastify
- [ ] Convert dead letter queue to async file I/O
- [ ] Add Secure and SameSite cookie flags
- [ ] Implement date-based dead letter queue rotation
- [ ] Add Error Boundary to React app
- [ ] Add correlation IDs to error responses
- [ ] Implement message pagination
- [ ] Create production-grade Docker setup
- [ ] Fix contact form to use single endpoint
- [ ] Add database indexes
- [ ] Use consistent IP extraction
- [ ] Improve Service Worker error handling
- [ ] Fix translation file caching strategy

