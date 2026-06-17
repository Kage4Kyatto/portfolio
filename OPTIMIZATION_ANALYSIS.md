# Portfolio Project Optimization Analysis

**Date:** June 17, 2026  
**Scope:** Full codebase analysis across backend Node.js, frontend JavaScript, CSS, and HTML

---

## BACKEND NODE.JS OPTIMIZATIONS

### 1. **Duplicate `getClientIp()` Function**
- **File:** [backend/node/controllers/contactController.js](backend/node/controllers/contactController.js), [backend/node/middleware/authMiddleware.js](backend/node/middleware/authMiddleware.js)
- **Current Issue:** The `getClientIp()` function is duplicated identically in two files. Both follow the same logic to extract client IP from headers.
- **Optimization Approach:** Extract to a shared utility module at `backend/node/utils/getClientIp.js` and import in both files.
- **Expected Impact:** 
  - Code maintainability: High (single source of truth)
  - Memory: Negligible
  - Performance: Negligible (function call overhead is minimal)
- **Priority:** High (reduces code duplication and maintenance burden)

---

### 2. **Custom Environment Variable Loading in server.js**
- **File:** [server.js](server.js#L1-L45)
- **Current Issue:** Manual `.env` file parsing with custom logic instead of using the `dotenv` package. This duplicates functionality that's already available in npm ecosystem.
- **Optimization Approach:** Replace manual `loadEnvFile()` with `require('dotenv').config()` from the existing dotenv package.
- **Expected Impact:**
  - Code readability: High (standard library usage)
  - Maintainability: High (removes 25+ lines of custom code)
  - Performance: Negligible improvement
- **Priority:** High (simplifies codebase, reduces maintenance surface)

---

### 3. **Redundant Database/JSON File Abstraction Pattern**
- **File:** [backend/node/data/storage.js](backend/node/data/storage.js)
- **Current Issue:** Every storage function repeats the same pattern: `if (await ensureDb()) { ...database queries } else { ...JSON file operations }`. This causes significant code duplication.
- **Optimization Approach:** Create wrapper functions that abstract the DB/file decision:
  ```javascript
  const readData = async (dbQuery, jsonPath, fallback) => {
    if (await ensureDb()) {
      return dbQuery();
    }
    return readJsonFile(jsonPath, fallback);
  };
  ```
- **Expected Impact:**
  - Code reduction: ~40% reduction in storage.js (currently ~300+ lines)
  - Maintainability: High (changes to DB logic only need one place)
  - Performance: Negligible
- **Priority:** High (reduces complexity, improves consistency)

---

### 4. **Rate Limiter Configuration Duplication**
- **File:** [backend/node/utils/rateLimiter.js](backend/node/utils/rateLimiter.js#L1-L50)
- **Current Issue:** Multiple similar limiter instances with overlapping configuration. Each limiter individually specifies `windowMs`, `max`, `message`, etc.
- **Optimization Approach:** Consolidate configuration into an object, use `createLimiter()` factory method more effectively:
  ```javascript
  const LIMITER_CONFIG = {
    api: { windowMs: 15*60*1000, max: 100 },
    contact: { windowMs: 60*60*1000, max: 5 },
    admin: { windowMs: 5*60*1000, max: 10 },
    auth: { windowMs: 15*60*1000, max: 5 }
  };
  ```
- **Expected Impact:**
  - Code reduction: ~30% (DRY principle)
  - Maintainability: High (centralized config)
  - Performance: Negligible
- **Priority:** Medium (good practice, easier testing)

---

### 5. **Missing Error Handling in Notification Queue Worker**
- **File:** [backend/node/services/notificationQueue.js](backend/node/services/notificationQueue.js#L50-L65)
- **Current Issue:** `processQueue()` errors are silently swallowed with `.catch(() => {})`. No logging, monitoring, or error visibility.
- **Optimization Approach:** 
  - Add proper error logging to the catch block
  - Implement health check endpoint for queue status
  - Add metrics collection for queue depth/processing times
- **Expected Impact:**
  - Debugging: High (visibility into failures)
  - Observability: High (production monitoring)
  - Performance: Negligible
- **Priority:** High (operational issue, affects production visibility)

---

### 6. **Inefficient Password Verification Logic**
- **File:** [backend/node/middleware/authMiddleware.js](backend/node/middleware/authMiddleware.js#L100-L130)
- **Current Issue:** Password validation checks both plain text AND hashed password sequentially, performing unnecessary crypto operations even when plain text password is configured.
- **Optimization Approach:** 
  - Short-circuit evaluation: check if hashed password is configured first
  - Optimize evaluation order based on configuration
  - Cache configuration checks outside function
- **Expected Impact:**
  - Performance: Low (~5-10% reduction on auth requests)
  - Security: No change
- **Priority:** Low (optimization only, not critical)

---

### 7. **Database Connection Pool Not Configured for Production**
- **File:** [backend/node/data/storage.js](backend/node/data/storage.js#L30-L50)
- **Current Issue:** Pool is created with default parameters. No connection pooling configuration for production environments.
- **Optimization Approach:**
  ```javascript
  const pool = new Pool({
    connectionString: databaseUrl,
    max: process.env.DB_POOL_SIZE || 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: process.env.DB_SSL === "false" ? false : undefined
  });
  ```
- **Expected Impact:**
  - Performance: Medium (better connection reuse)
  - Stability: Medium (prevents connection exhaustion)
  - Resource usage: Medium (controlled pool size)
- **Priority:** High (production-critical for scaling)

---

### 8. **Missing Request ID Propagation to Database**
- **File:** [server.js](server.js#L140-L160), [backend/node/data/storage.js](backend/node/data/storage.js)
- **Current Issue:** Request ID is generated in middleware but never used in database queries, making debugging distributed calls impossible.
- **Optimization Approach:** Pass request ID context through storage layer queries for correlation logging.
- **Expected Impact:**
  - Debugging: High (request tracing)
  - Observability: High (distributed trace correlation)
  - Performance: Negligible
- **Priority:** Medium (observability improvement)

---

### 9. **Inefficient Rate Limit Cleanup Logic**
- **File:** [backend/node/controllers/contactController.js](backend/node/controllers/contactController.js#L18-L25)
- **Current Issue:** Every rate limit check iterates through ALL stored limits to clean up expired ones. This is O(n) and happens on every request.
- **Optimization Approach:** 
  - Add timestamp-based cleanup only when limits dictionary exceeds threshold
  - Batch cleanup every N requests instead of per-request
- **Expected Impact:**
  - Performance: Medium (eliminates O(n) loop on hot path)
  - Memory: Low (same memory usage)
- **Priority:** Medium (optimization on hot path)

---

### 10. **Notification Queue Backoff Without Jitter**
- **File:** [backend/node/services/notificationQueue.js](backend/node/services/notificationQueue.js#L45-L55)
- **Current Issue:** Exponential backoff formula `retryDelayMs * 2 ** (nextAttempts - 1)` has no jitter, causing thundering herd problem.
- **Optimization Approach:** Add random jitter to backoff:
  ```javascript
  const backoff = Math.min(maxBackoffMs, retryDelayMs * 2 ** Math.max(0, nextAttempts - 1));
  const jitter = Math.random() * 0.2 * backoff; // ±10% jitter
  pending.push({...job, nextAttemptAt: now + backoff + jitter});
  ```
- **Expected Impact:**
  - Reliability: High (prevents simultaneous retries)
  - Performance: Medium (better queue distribution)
- **Priority:** Medium (reliability improvement)

---

## FRONTEND JAVASCRIPT OPTIMIZATIONS

### 11. **Duplicate `escapeHtml()` Function**
- **Files:** [public/assets/js/pages/admin.js](public/assets/js/pages/admin.js#L7-L14), [public/assets/js/pages/blog.js](public/assets/js/pages/blog.js#L3-L9), [public/assets/js/pages/analytics.js](public/assets/js/pages/analytics.js#L4-L11)
- **Current Issue:** Identical HTML escaping utility is duplicated in 3 separate files (186 bytes per copy = 558 bytes wasted).
- **Optimization Approach:** Create shared utility module `public/assets/js/utils/html.js` with `escapeHtml()` export.
- **Expected Impact:**
  - Bundle size: Low (~0.5KB reduction after gzip, but improves maintainability)
  - Maintainability: High (single source of truth)
  - Performance: Negligible
- **Priority:** High (good practice, maintainability)

---

### 12. **Admin Page: DOM State Not Cleaned Up on Logout**
- **File:** [public/assets/js/pages/admin.js](public/assets/js/pages/admin.js#L250-L300)
- **Current Issue:** Event listeners added to form elements are never removed. When user logs out, listeners remain attached, consuming memory and firing when forms are re-rendered.
- **Optimization Approach:** Add cleanup function that removes all event listeners on logout:
  ```javascript
  const cleanupAdminPage = () => {
    // Remove all listeners
    authForm?.removeEventListener('submit', handleLogin);
    searchInput?.removeEventListener('input', handleSearch);
    // ... etc
    allMessages = [];
    currentPage = 1;
  };
  ```
- **Expected Impact:**
  - Memory leaks: High (prevents accumulation of stale listeners)
  - User experience: High (prevents ghost interactions)
- **Priority:** High (memory leak prevention)

---

### 13. **Contact Form: Inline Endpoint Fallback Logic**
- **File:** [public/assets/js/pages/contact.js](public/assets/js/pages/contact.js#L38-L90)
- **Current Issue:** Complex nested try-catch with multiple endpoint fallback logic is inline in form submission handler. ~60 lines of fallback complexity mixed with form handling.
- **Optimization Approach:** Extract into reusable function:
  ```javascript
  const tryEndpoints = async (endpoints, payload, timeoutMs = 8000) => {
    // Fallback logic here
  };
  ```
- **Expected Impact:**
  - Code readability: High (separates concerns)
  - Testability: High (can unit test fallback logic)
  - Performance: Negligible
- **Priority:** Medium (code quality improvement)

---

### 14. **Main Page: Repeated DOM Queries Without Caching**
- **File:** [public/assets/js/core/main.js](public/assets/js/core/main.js#L1-L50)
- **Current Issue:** `document.querySelector()` calls for elements that never change (`.nav-links`, `.menu-toggle`) are called multiple times throughout initialization and event handlers.
- **Optimization Approach:** Cache query results:
  ```javascript
  const navLinks = document.querySelector(".nav-links");
  const menuButton = document.querySelector(".menu-toggle");
  // Already done correctly at top of file, but should extend pattern to all elements
  ```
- **Expected Impact:**
  - Performance: Low (DOM queries are fast, but repeated caching is best practice)
  - Code clarity: Medium
- **Priority:** Low (already partially implemented)

---

### 15. **Blog.js: Repeated parseJsonSafely Pattern**
- **File:** [public/assets/js/pages/blog.js](public/assets/js/pages/blog.js), [public/assets/js/pages/contact.js](public/assets/js/pages/contact.js#L6-L14)
- **Current Issue:** Safe JSON parsing pattern `try { JSON.parse() } catch { return null }` is repeated across files instead of being a shared utility.
- **Optimization Approach:** Extract to `public/assets/js/utils/json.js`:
  ```javascript
  export const parseJsonSafely = (value) => {
    if (!value) return null;
    try { return JSON.parse(value); } 
    catch { return null; }
  };
  ```
- **Expected Impact:**
  - Bundle size: Low
  - Maintainability: High
- **Priority:** Medium (good practice)

---

### 16. **Analytics Page: Full DOM Rebuild on Every Filter Change**
- **File:** [public/assets/js/pages/analytics.js](public/assets/js/pages/analytics.js#L40-L80)
- **Current Issue:** `renderAnalytics()` generates ALL HTML as string and replaces entire container innerHTML. This causes:
  - Layout thrashing
  - Animation interruption
  - Loss of scroll position
  - Inefficient re-renders
- **Optimization Approach:** Use DOM diffing or update only changed sections:
  ```javascript
  const renderAnalytics = () => {
    if (!currentAnalytics) return;
    updateSummarySection(currentAnalytics);
    updateActivityChart(currentAnalytics);
    updateSourceChart(currentAnalytics);
  };
  ```
- **Expected Impact:**
  - Performance: Medium (reduces layout thrashing)
  - User experience: Medium (smoother interactions)
- **Priority:** Medium (performance improvement)

---

### 17. **Validation.js: Inline Regex Compilation**
- **File:** [public/assets/js/core/validation.js](public/assets/js/core/validation.js#L1-L20)
- **Current Issue:** Regex patterns are defined inline in the `VALIDATION_RULES` object and recompiled on every `validateField()` call:
  ```javascript
  pattern: /^[a-zA-Z\s'-]+$/, // Recompiled every time
  ```
- **Optimization Approach:** Pre-compile regexes:
  ```javascript
  const NAME_PATTERN = /^[a-zA-Z\s'-]+$/;
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const VALIDATION_RULES = {
    name: { pattern: NAME_PATTERN, ... }
  };
  ```
- **Expected Impact:**
  - Performance: Low (~1-2% on validation-heavy pages)
  - Code clarity: Medium
- **Priority:** Low (micro-optimization)

---

### 18. **Toast.js: No Accessibility for Toast Dismissal**
- **File:** [public/assets/js/core/toast.js](public/assets/js/core/toast.js)
- **Current Issue:** Toast elements have `role="status"` but no dismiss button or keyboard support for users who need extended reading time.
- **Optimization Approach:** Add dismissible toast with button:
  ```javascript
  toast.innerHTML = `${message}<button aria-label="Close notification" class="toast-close">&times;</button>`;
  toast.querySelector('.toast-close')?.addEventListener('click', () => {
    toast.classList.remove("toast--visible");
  });
  ```
- **Expected Impact:**
  - Accessibility: High
  - User experience: Medium
- **Priority:** Medium (a11y improvement)

---

### 19. **Admin.js: Manual State Management**
- **File:** [public/assets/js/pages/admin.js](public/assets/js/pages/admin.js#L15-L30)
- **Current Issue:** Multiple variables track UI state (`currentPage`, `pageSize`, `isLoadingMessages`, `allMessages`, `filteredMessages`). No centralized state management.
- **Optimization Approach:** Create state object:
  ```javascript
  const state = {
    messages: [],
    filtered: [],
    currentPage: 1,
    pageSize: 10,
    isLoading: false,
    update(changes) { Object.assign(this, changes); render(); }
  };
  ```
- **Expected Impact:**
  - Maintainability: High (predictable state flow)
  - Debugging: High (single source of state)
  - Performance: Negligible
- **Priority:** Medium (code quality)

---

### 20. **Language Toggle: Inefficient Locale Dictionary Caching**
- **File:** [public/assets/js/core/main.js](public/assets/js/core/main.js#L60-L90)
- **Current Issue:** Locale dictionary is fetched on every page load even if already cached in localStorage. The fetch happens before checking cache.
- **Optimization Approach:** Load from localStorage first, only fetch if missing:
  ```javascript
  const cachedLocale = localStorage.getItem(LOCALE_CACHE_KEY);
  if (cachedLocale) {
    applyLocale(locale, JSON.parse(cachedLocale));
  } else {
    const dict = await loadLocaleDictionary(locale);
    localStorage.setItem(LOCALE_CACHE_KEY, JSON.stringify(dict));
    applyLocale(locale, dict);
  }
  ```
- **Expected Impact:**
  - Performance: Low (~50-100ms per page load for network users)
  - User experience: Low (imperceptible on fast connections)
- **Priority:** Low (optimization)

---

## CSS OPTIMIZATIONS

### 21. **Repeated `rgba()` Color Values**
- **File:** [public/assets/css/styles.css](public/assets/css/styles.css)
- **Current Issue:** Colors like `rgba(125, 211, 252, 0.08)` appear 10+ times. Also `rgba(59, 130, 246, 0.xx)` in multiple forms.
- **Optimization Approach:** Use CSS custom properties with opacity channel:
  ```css
  :root {
    --brand-rgb: 118, 239, 217; /* Remove alpha, let opacity handle it */
    --blue-rgb: 59, 130, 246;
  }
  .element {
    background: rgba(var(--brand-rgb), 0.08);
    border: 1px solid rgba(var(--blue-rgb), 0.16);
  }
  ```
- **Expected Impact:**
  - Bundle size: Medium (~5-8KB reduction)
  - Maintainability: High (centralized colors)
  - Performance: Negligible (same rendering)
- **Priority:** High (reduces CSS bloat)

---

### 22. **`border-radius: 999px` Used 15+ Times**
- **File:** [public/assets/css/styles.css](public/assets/css/styles.css)
- **Current Issue:** Perfect circles/pills use `border-radius: 999px` directly instead of custom property.
- **Optimization Approach:** Already has `--radius` variables, but should add:
  ```css
  :root {
    --radius-full: 999px; /* or use CSS logical properties */
  }
  .element { border-radius: var(--radius-full); }
  ```
- **Expected Impact:**
  - Bundle size: Low (~200 bytes reduction)
  - Maintainability: Medium
- **Priority:** Low (mostly aesthetic)

---

### 23. **Repeated Box-Shadow Patterns**
- **File:** [public/assets/css/styles.css](public/assets/css/styles.css)
- **Current Issue:** Shadow definitions like `0 28px 70px rgba(0, 0, 0, 0.3)` are repeated for similar depth levels.
- **Optimization Approach:** Define shadow tokens:
  ```css
  :root {
    --shadow-lg: 0 28px 70px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 14px 30px rgba(0, 0, 0, 0.18);
    --shadow-sm: 0 1px 0 rgba(255, 255, 255, 0.02);
  }
  ```
- **Expected Impact:**
  - Bundle size: Low (~300 bytes)
  - Maintainability: High
- **Priority:** Low (code quality)

---

### 24. **Font-Family Declaration Duplication**
- **File:** [public/assets/css/styles.css](public/assets/css/styles.css)
- **Current Issue:** `font-family: "Inter", "Segoe UI", sans-serif;` declared 5+ times individually.
- **Optimization Approach:** Add to `:root` or use in `body`:
  ```css
  :root {
    --font-body: "Inter", "Segoe UI", sans-serif;
  }
  body { font-family: var(--font-body); }
  ```
- **Expected Impact:**
  - Bundle size: Low (~150 bytes)
  - Maintainability: Low (already pretty good)
- **Priority:** Low (micro-optimization)

---

### 25. **Unused or Duplicate Animation Definitions**
- **File:** [public/assets/css/styles.css](public/assets/css/styles.css)
- **Current Issue:** Animation names suggest duplicates (`splashBassRing`, `splashBassWave`, `splashBassThrob` all similar). Need audit for unused keyframes.
- **Optimization Approach:** Run Lighthouse coverage audit to identify unused CSS. Consolidate similar animations.
- **Expected Impact:**
  - Bundle size: Medium (~2-5KB potential)
  - Performance: Negligible (animations only run when triggered)
- **Priority:** Medium (requires audit first)

---

## HTML OPTIMIZATIONS

### 26. **Duplicate Meta Tags and JSON-LD Across Files**
- **Files:** [public/index.html](public/index.html), [public/contact.html](public/contact.html), and others
- **Current Issue:** Each HTML file duplicates:
  - Font preload/preconnect links
  - Meta tags (charset, viewport, robots, author, og:, twitter:)
  - JSON-LD script blocks for organization/breadcrumbs
  - Same navigation structure
- **Optimization Approach:** Use server-side template or template engine to share header/footer. Or use HTML include strategy (commented solution would be a template file).
- **Expected Impact:**
  - Bundle size: High (~5-10KB reduction if static HTML)
  - Maintainability: High (single source for navigation, meta)
  - Performance: Medium (reduced HTML payload)
- **Priority:** High (DRY principle, easier maintenance)

---

### 27. **Navigation Structure Duplication**
- **Files:** All HTML files in `/public`
- **Current Issue:** The same navigation menu is manually repeated in every HTML file with identical links.
- **Optimization Approach:**
  - Option 1: Server-side templating (recommended for production)
  - Option 2: JavaScript-based nav injection on page load
  - Option 3: Web Components for reusable nav component
- **Expected Impact:**
  - Maintainability: High (single nav source)
  - Development velocity: High (change nav once)
- **Priority:** High (maintenance efficiency)

---

### 28. **SVG GitHub Icon Inline Multiple Times**
- **Files:** [public/contact.html](public/contact.html), likely others
- **Current Issue:** SVG GitHub icon is defined inline as data URI or code in multiple files. Each page includes full SVG markup.
- **Optimization Approach:** 
  - Create SVG sprite at `/assets/img/sprites.svg`
  - Reference with `<use xlink:href="/assets/img/sprites.svg#github"></use>`
  - Or use Web Components wrapper
- **Expected Impact:**
  - Bundle size: Medium (~2KB reduction if repeated across 5+ pages)
  - Caching: High (sprite cached separately)
  - Performance: Medium (single asset load)
- **Priority:** Medium (optimization)

---

### 29. **Preload/Preconnect Not Optimally Ordered**
- **File:** [public/contact.html](public/contact.html), [public/index.html](public/index.html)
- **Current Issue:** 
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?..." rel="stylesheet" />
  ```
  The stylesheet link should have `rel="preload"` attribute for higher priority.
- **Optimization Approach:**
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="preload" href="..." as="font" type="font/woff2" crossorigin />
  <link href="..." rel="stylesheet" />
  ```
- **Expected Impact:**
  - Performance: Low (~50-100ms on slow connections)
  - Font loading: Medium (visible text sooner)
- **Priority:** Low (marginal improvement)

---

### 30. **Missing `loading="lazy"` on Below-Fold Images**
- **Files:** All HTML pages
- **Current Issue:** All `<img>` tags likely load immediately even if not visible on page load (hero images, blog thumbnails below fold).
- **Optimization Approach:** Add `loading="lazy"` to images not in viewport:
  ```html
  <img src="..." alt="..." loading="lazy" />
  ```
- **Expected Impact:**
  - Performance: Medium (reduces initial page load by ~10-20%)
  - Bandwidth: Medium (images only load when needed)
  - User experience: Low (perceived performance)
- **Priority:** Medium (easy win for performance)

---

### 31. **Meta Description Inconsistency**
- **Files:** All HTML files
- **Current Issue:** Some files have detailed meta descriptions, others are missing or generic. Inconsistent length and SEO optimization.
- **Optimization Approach:** Audit and standardize meta descriptions to 150-160 chars with keywords.
- **Expected Impact:**
  - SEO: Low (minor impact on SERP CTR)
  - UX: Low
- **Priority:** Low (SEO hygiene)

---

## SUMMARY TABLE

| Issue | File(s) | Type | Priority | Impact | Effort |
|-------|---------|------|----------|--------|--------|
| Duplicate `getClientIp()` | backend/node/* | Backend | High | Maintainability | Low |
| Custom env loading | server.js | Backend | High | Simplicity | Low |
| DB/JSON abstraction | storage.js | Backend | High | Code reduction | Medium |
| Rate limiter config | rateLimiter.js | Backend | Medium | DRY | Low |
| Queue error handling | notificationQueue.js | Backend | High | Observability | Low |
| Duplicate `escapeHtml()` | admin/blog/analytics.js | Frontend | High | Maintainability | Low |
| Admin page cleanup | admin.js | Frontend | High | Memory leaks | Low |
| Contact form refactor | contact.js | Frontend | Medium | Testability | Medium |
| Repeated DOM queries | main.js | Frontend | Low | Best practice | Low |
| Analytics re-render | analytics.js | Frontend | Medium | Performance | Medium |
| CSS color variables | styles.css | CSS | High | Maintainability | Medium |
| HTML duplication | All HTML | HTML | High | Maintenance | High |
| Missing lazy loading | All HTML | HTML | Medium | Performance | Low |

---

## RECOMMENDED IMPLEMENTATION ORDER

### Phase 1 (Quick Wins - < 30 minutes)
1. Extract `getClientIp()` utility
2. Extract `escapeHtml()` utility
3. Replace custom env loading with dotenv
4. Add `loading="lazy"` to images
5. Add toast dismiss button

### Phase 2 (Medium Effort - 1-2 hours)
6. Consolidate rate limiter config
7. Extract contact form fallback logic
8. Add CSS custom property tokens
9. Implement admin page cleanup on logout
10. Fix notification queue error handling

### Phase 3 (Larger Refactors - 2-4 hours)
11. Abstract DB/JSON storage pattern
12. Implement HTML templating for shared markup
13. Optimize analytics rendering
14. Add database connection pooling
15. Implement SVG sprites

### Phase 4 (Future Improvements)
16. Add request ID propagation
17. Implement rate limit cleanup optimization
18. Add notification queue jitter
19. Performance audit for unused CSS
20. Consider state management library for admin page

