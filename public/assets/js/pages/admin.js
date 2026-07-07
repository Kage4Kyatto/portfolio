// Updated 2026-07-07
const authForm = document.getElementById("admin-auth-form");
const notice = document.getElementById("admin-notice");
const tableBody = document.getElementById("messages-body");
const searchInput = document.getElementById("message-search");
const pageSizeSelect = document.getElementById("page-size");
const prevButton = document.getElementById("prev-page");
const nextButton = document.getElementById("next-page");
const exportButton = document.getElementById("export-csv");
const pageInfo = document.getElementById("page-info");
const deliveryStatus = document.getElementById("delivery-status");
const adminUserInput = document.getElementById("admin-user");
const adminPassInput = document.getElementById("admin-pass");
const adminOtpInput = document.getElementById("admin-otp");
const logoutButton = document.getElementById("admin-logout");
const pagePanel = document.querySelector(".admin-page .page-panel");
const adminControls = document.querySelector(".admin-controls");
const tableWrap = document.querySelector(".table-wrap");
const queueRefreshButton = document.getElementById("queue-refresh");
const queueProcessButton = document.getElementById("queue-process");
const queuePauseButton = document.getElementById("queue-pause");
const queueResumeButton = document.getElementById("queue-resume");
const queueClearButton = document.getElementById("queue-clear");
const queueOutput = document.getElementById("queue-output");
const performanceOutput = document.getElementById("performance-output");
const summaryLoadButton = document.getElementById("summary-load");
const summaryEngineSelect = document.getElementById("summary-engine");
const summaryOutput = document.getElementById("summary-output");
const auditRefreshButton = document.getElementById("audit-refresh");
const auditOutput = document.getElementById("audit-output");
const auditFilter = document.getElementById("audit-filter");

const ADMIN_LOCALE_STORAGE_KEY = "portfolio.locale";

let allMessages = [];
let filteredMessages = [];
let currentPage = 1;
let pageSize = Number(pageSizeSelect?.value || 10);
let isLoadingMessages = false;
let autoLoadTimer = null;
let lastAttemptFingerprint = "";
let csrfToken = "";
let inactivityTimer = null;
let activeLocale = localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY) || "en";
let localeDictionary = {};
let deliveryMode = "checking";
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

const t = (key, fallback) => localeDictionary[key] || fallback;

const loadLocaleDictionary = async (locale) => {
  try {
    const response = await fetch(`/assets/i18n/${locale}.json`, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    localeDictionary = await response.json();
  } catch {
    // Ignore translation loading errors and keep fallback text.
  }
};

const setDashboardVisibility = (isVisible) => {
  if (pagePanel) {
    pagePanel.hidden = !isVisible;
    pagePanel.style.display = isVisible ? "block" : "none";
  }

  if (adminControls) {
    adminControls.hidden = !isVisible;
    adminControls.style.display = isVisible ? "grid" : "none";
  }

  if (tableWrap) {
    tableWrap.hidden = !isVisible;
    tableWrap.style.display = isVisible ? "block" : "none";
  }

  if (pageInfo) {
    pageInfo.hidden = !isVisible;
    pageInfo.style.display = isVisible ? "block" : "none";
  }

  if (logoutButton) {
    logoutButton.hidden = !isVisible;
    logoutButton.style.display = isVisible ? "inline-block" : "none";
  }
};

const syncSearchPlaceholder = () => {
  if (!searchInput) {
    return;
  }

  searchInput.setAttribute(
    "placeholder",
    t(
      "admin_search_placeholder",
      activeLocale === "nl"
        ? "Zoek op naam, e-mail, onderwerp, bericht"
        : "Find by name, email, subject, message"
    )
  );
};

const syncDeliveryStatusText = (mode = "checking", metrics = null) => {
  if (!deliveryStatus) {
    return;
  }

  let message = "";
  let className = "notice";

  if (mode === "checking") {
    message = t(
      "admin_delivery_checking",
      activeLocale === "nl"
        ? "E-mailbezorgstatus: controleren..."
        : "Email delivery status: checking..."
    );
  } else if (mode === "resend") {
    message = t(
      "admin_delivery_resend",
      activeLocale === "nl"
        ? "E-mailbezorgmodus: Resend API"
        : "Email delivery mode: Resend API"
    );
    className = "notice success";
  } else if (mode === "php") {
    message = t(
      "admin_delivery_php",
      activeLocale === "nl"
        ? "E-mailbezorgmodus: PHP mail()-fallback"
        : "Email delivery mode: PHP mail() fallback"
    );
  } else if (mode === "disabled") {
    message = t(
      "admin_delivery_disabled",
      activeLocale === "nl"
        ? "E-mailbezorgmodus: Uitgeschakeld (CONTACT_NOTIFY_TO niet ingesteld)"
        : "Email delivery mode: Disabled (CONTACT_NOTIFY_TO not set)"
    );
    className = "notice error";
  } else if (mode === "unavailable") {
    message = t(
      "admin_delivery_unavailable",
      activeLocale === "nl"
        ? "E-mailbezorgstatus niet beschikbaar."
        : "Email delivery status unavailable."
    );
    className = "notice error";
  }

  if (metrics) {
    const queueLabel = t("admin_metrics_queue", activeLocale === "nl" ? "Wachtrij" : "Queue");
    const lockoutsLabel = t("admin_metrics_lockouts", activeLocale === "nl" ? "Blokkades" : "Lockouts");
    message = `${message} | ${queueLabel}: ${metrics.queueDepth} | ${lockoutsLabel}: ${metrics.lockedAuthIps}`;
  }

  deliveryStatus.textContent = message;
  deliveryStatus.className = className;
};

window.addEventListener("portfolio:locale-changed", (event) => {
  activeLocale = event.detail?.locale || activeLocale;
  localeDictionary = event.detail?.dictionary || localeDictionary;
  syncSearchPlaceholder();

  if (!isLoadingMessages) {
    updatePagerUi();
  }
});

const escapeCell = (value) => String(value ?? "").replace(/[\r\n]+/g, " ").trim();

const getVisibleMessages = () => {
  const startIndex = (currentPage - 1) * pageSize;
  return filteredMessages.slice(startIndex, startIndex + pageSize);
};

const updatePagerUi = () => {
  if (!pageInfo || !prevButton || !nextButton) {
    return;
  }

  const totalItems = filteredMessages.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, currentPage * pageSize);

  const showingLabel = t("admin_pager_showing", activeLocale === "nl" ? "Toont" : "Showing");
  const ofLabel = t("admin_pager_of", activeLocale === "nl" ? "van" : "of");
  const messagesLabel = t("admin_pager_messages", activeLocale === "nl" ? "bericht(en)" : "message(s)");
  const pageLabel = t("admin_pager_page", activeLocale === "nl" ? "Pagina" : "Page");

  pageInfo.textContent = `${showingLabel} ${startItem}-${endItem} ${ofLabel} ${totalItems} ${messagesLabel} | ${pageLabel} ${currentPage}/${totalPages}`;
  prevButton.disabled = currentPage <= 1;
  nextButton.disabled = currentPage >= totalPages;
};

const applyFilter = () => {
  const query = (searchInput?.value || "").trim().toLowerCase();
  filteredMessages = allMessages.filter((message) => {
    if (!query) {
      return true;
    }

    const searchable = [message.name, message.email, message.subject, message.message]
      .join(" ")
      .toLowerCase();
    return searchable.includes(query);
  });

  const totalPages = Math.max(1, Math.ceil(filteredMessages.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  if (currentPage < 1) {
    currentPage = 1;
  }
};

const renderRows = (messages) => {
  if (!tableBody) {
    return;
  }

  if (!messages.length) {
    tableBody.innerHTML = `<tr><td colspan="6">${t("admin_no_messages_found", activeLocale === "nl" ? "Geen berichten gevonden." : "No messages found.")}</td></tr>`;
    return;
  }

  tableBody.innerHTML = messages
    .map((message) => {
      const date = escapeHtml(new Date(message.createdAt).toLocaleString());
      return `<tr>
        <td>${escapeHtml(message.id)}</td>
        <td>${escapeHtml(message.name)}</td>
        <td>${escapeHtml(message.email)}</td>
        <td>${escapeHtml(message.subject)}</td>
        <td>${escapeHtml(message.message)}</td>
        <td>${date}</td>
      </tr>`;
    })
    .join("");
};

const render = () => {
  applyFilter();
  renderRows(getVisibleMessages());
  updatePagerUi();
};

const toCsv = (messages) => {
  const headers = ["id", "name", "email", "subject", "message", "createdAt"];
  const lines = [headers.join(",")];

  messages.forEach((message) => {
    const row = headers.map((header) => {
      const value = escapeCell(message[header]);
      return `"${value.replace(/"/g, '""')}"`;
    });
    lines.push(row.join(","));
  });

  return lines.join("\n");
};

const downloadCsv = (messages) => {
  const csv = toCsv(messages);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "contact-messages.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const fetchJsonWithFallback = async (endpoints, options = {}) => {
  let lastError = new Error(t("admin_request_failed", activeLocale === "nl" ? "Aanvraag mislukt." : "Request failed."));

  for (let index = 0; index < endpoints.length; index += 1) {
    const endpoint = endpoints[index];
    const hasNextEndpoint = index < endpoints.length - 1;

    try {
      const response = await fetch(endpoint, options);
      const bodyText = await response.text();
      let parsed = null;

      if (bodyText) {
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          parsed = null;
        }
      }

      if (!response.ok) {
        const authErrorMessage = t(
          "admin_session_expired",
          activeLocale === "nl" ? "Sessie verlopen. Log opnieuw in." : "Session expired. Please log in again."
        );
        const requestError = new Error(
          (response.status === 401 || response.status === 403)
            ? authErrorMessage
            : (parsed?.message || t("admin_request_failed_status", activeLocale === "nl"
              ? `Aanvraag mislukt met status ${response.status}.`
              : `Request failed with status ${response.status}.`))
        );
        requestError.status = response.status;
        requestError.attemptsRemaining = parsed?.attemptsRemaining;
        requestError.retryAfterSec = parsed?.retryAfterSec;

        if ((response.status === 401 || response.status === 403 || response.status === 400) || parsed) {
          requestError.stopFallback = true;
        }

        if (!hasNextEndpoint) {
          requestError.stopFallback = true;
        }

        throw requestError;
      }

      if (!parsed) {
        if (response.ok && bodyText.trim() === "") {
          return {};
        }

        const parseError = new Error(t("admin_non_json", activeLocale === "nl" ? "API-eindpunt reageerde met geen JSON-inhoud." : "API endpoint responded with non-JSON content."));

        if (!hasNextEndpoint) {
          parseError.stopFallback = true;
        }

        throw parseError;
      }

      return parsed;
    } catch (error) {
      if (error.stopFallback) {
        throw error;
      }

      lastError = error;
    }
  }

  throw lastError;
};

const loadDeliveryStatus = async () => {
  if (!deliveryStatus) {
    return;
  }

  syncDeliveryStatusText("checking");

  try {
    const data = await fetchJsonWithFallback(["/api/health", "/api/health.php"]);
    const mode = data?.notifications?.mode || "disabled";

    if (mode === "resend") {
      deliveryMode = "resend";
      syncDeliveryStatusText(deliveryMode);
      return;
    }

    if (mode === "php-mail-fallback") {
      deliveryMode = "php";
      syncDeliveryStatusText(deliveryMode);
      return;
    }

    deliveryMode = "disabled";
    syncDeliveryStatusText(deliveryMode);
  } catch {
    deliveryMode = "unavailable";
    syncDeliveryStatusText(deliveryMode);
  }
};

const loadAdminMetrics = async () => {
  if (!deliveryStatus) {
    return;
  }

  try {
    const result = await fetchJsonWithFallback(["/api/admin/metrics"]);
    const metrics = result?.metrics;
    const storage = result?.storage;
    if (!metrics) {
      return;
    }

    syncDeliveryStatusText(deliveryMode, metrics);

    if (summaryOutput && storage) {
      const metadata = {
        storage,
        queueDepth: metrics.queueDepth,
        lockedAuthIps: metrics.lockedAuthIps
      };
      summaryOutput.dataset.runtimeStatus = JSON.stringify(metadata);
    }
  } catch {
    // Metrics are optional and should not block page functionality.
  }
};

const setQueueOutput = (payload) => {
  if (!queueOutput) {
    return;
  }

  queueOutput.textContent = JSON.stringify(payload, null, 2);
};

const setPerformanceOutput = (performancePayload) => {
  if (!performanceOutput) {
    return;
  }

  const routes = Array.isArray(performancePayload?.routes)
    ? performancePayload.routes.slice(0, 8)
    : [];

  if (routes.length === 0) {
    performanceOutput.innerHTML = "<p class=\"audit-empty\">No performance metrics loaded yet.</p>";
    return;
  }

  const rows = routes
    .map((route) => {
      return `<tr>
        <td>${escapeHtml(route.route || "-")}</td>
        <td>${escapeHtml(route.totalRequests || 0)}</td>
        <td>${escapeHtml(route.p50Ms || 0)} ms</td>
        <td>${escapeHtml(route.p95Ms || 0)} ms</td>
        <td>${escapeHtml(Math.round(Number(route.errorRate || 0) * 100))}%</td>
      </tr>`;
    })
    .join("");

  performanceOutput.innerHTML = `<div class="audit-meta">Top routes by request volume</div>
    <div class="audit-table-wrap">
      <table class="audit-table">
        <thead>
          <tr>
            <th>Route</th>
            <th>Requests</th>
            <th>p50</th>
            <th>p95</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
};

const loadQueueHealth = async () => {
  if (!queueOutput) {
    return;
  }

  try {
    const result = await fetchJsonWithFallback(["/api/admin/queue"]);
    setQueueOutput(result.queue || result);
  } catch (error) {
    setQueueOutput({
      success: false,
      message: error.message || "Failed to load queue state."
    });
  }
};

const processQueue = async () => {
  if (!queueOutput) {
    return;
  }

  try {
    const response = await fetch("/api/admin/queue/process", {
      method: "POST",
      headers: csrfToken
        ? { "X-CSRF-Token": csrfToken }
        : {}
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || "Failed to process queue.");
    }

    setQueueOutput(body.queue || body);
    if (window.toast) {
      window.toast.success("Queue processed.");
    }
  } catch (error) {
    setQueueOutput({
      success: false,
      message: error.message || "Failed to process queue."
    });
  }
};

const postQueueAction = async (endpoint, successMessage, failureMessage) => {
  if (!queueOutput) {
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: csrfToken
        ? { "X-CSRF-Token": csrfToken }
        : {}
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || failureMessage);
    }

    setQueueOutput(body.queue || body);
    if (window.toast) {
      window.toast.success(successMessage);
    }
  } catch (error) {
    setQueueOutput({
      success: false,
      message: error.message || failureMessage
    });
  }
};

const loadReportSummary = async () => {
  if (!summaryOutput) {
    return;
  }

  const engine = summaryEngineSelect?.value || "auto";

  try {
    const result = await fetchJsonWithFallback([
      `/api/admin/report-summary?engine=${encodeURIComponent(engine)}`
    ]);
    const runtimeStatus = summaryOutput.dataset.runtimeStatus
      ? parseJsonSafely(summaryOutput.dataset.runtimeStatus)
      : null;

    summaryOutput.textContent = JSON.stringify({
      ...(result.summary || result),
      ...(runtimeStatus ? { runtimeStatus } : {})
    }, null, 2);
  } catch (error) {
    summaryOutput.textContent = JSON.stringify({
      success: false,
      message: error.message || "Failed to load summary."
    }, null, 2);
  }
};

const classifyAuditEvent = (eventName) => {
  if (String(eventName || "").startsWith("admin_")) {
    return "admin";
  }

  return "telemetry";
};

const formatAuditTime = (input) => {
  const timestamp = Date.parse(String(input || ""));
  if (!Number.isFinite(timestamp)) {
    return "-";
  }

  return new Date(timestamp).toLocaleString();
};

const setAuditOutput = (payload) => {
  if (!auditOutput) {
    return;
  }

  if (!Array.isArray(payload)) {
    const message = payload?.message || "No matching audit events.";
    auditOutput.innerHTML = `<p class="audit-empty">${escapeHtml(message)}</p>`;
    return;
  }

  const events = payload;
  const filter = auditFilter?.value || "all";
  const filtered = filter === "all"
    ? events
    : events.filter((entry) => classifyAuditEvent(entry?.event) === filter);

  if (filtered.length === 0) {
    auditOutput.innerHTML = "<p class=\"audit-empty\">No matching audit events.</p>";
    return;
  }

  const rows = filtered
    .slice(0, 100)
    .map((entry) => {
      const type = classifyAuditEvent(entry?.event);
      return `<tr>
        <td>${escapeHtml(formatAuditTime(entry?.timestamp))}</td>
        <td><span class="audit-badge audit-badge--${escapeHtml(type)}">${escapeHtml(type)}</span></td>
        <td>${escapeHtml(entry?.event || "unknown")}</td>
        <td>${escapeHtml(entry?.path || "-")}</td>
        <td>${escapeHtml(entry?.locale || "en")}</td>
      </tr>`;
    })
    .join("");

  auditOutput.innerHTML = `<div class="audit-meta">Showing ${filtered.length} event(s)</div>
    <div class="audit-table-wrap">
      <table class="audit-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Type</th>
            <th>Event</th>
            <th>Path</th>
            <th>Locale</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
};

const loadAuditEvents = async () => {
  if (!auditOutput) {
    return;
  }

  try {
    const result = await fetchJsonWithFallback(["/api/admin/audit-events?limit=50"]);
    setAuditOutput(result.events || result);
    auditOutput.dataset.rawEvents = JSON.stringify(result.events || []);
  } catch (error) {
    setAuditOutput({
      success: false,
      message: error.message || "Failed to load audit events."
    });
    auditOutput.dataset.rawEvents = "[]";
  }
};

const loadPerformanceMetrics = async () => {
  if (!queueOutput) {
    return;
  }

  try {
    const result = await fetchJsonWithFallback(["/api/admin/performance"]);
    const performance = result.performance || {};
    queueOutput.dataset.performance = JSON.stringify(performance);
    setPerformanceOutput(performance);
    loadQueueHealth();
  } catch {
    queueOutput.dataset.performance = "{}";
    setPerformanceOutput({ routes: [] });
  }
};

const loadStorageStatus = async () => {
  if (!summaryOutput) {
    return;
  }

  try {
    const result = await fetchJsonWithFallback(["/api/admin/storage-status"]);
    summaryOutput.dataset.storageStatus = JSON.stringify(result.storage || {});
  } catch {
    summaryOutput.dataset.storageStatus = "{}";
  }
};

const clearInactivityTimer = () => {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
};

const triggerInactivityLogout = () => {
  if (!csrfToken || !logoutButton || logoutButton.hidden) {
    return;
  }

  const timeoutMessage = t(
    "admin_session_timeout",
    activeLocale === "nl"
      ? "Sessie is verlopen door inactiviteit."
      : "Session timed out due to inactivity."
  );

  notice.textContent = timeoutMessage;
  notice.className = "notice error";
  if (window.toast) {
    window.toast.error(timeoutMessage);
  }
  logoutButton.click();
};

const scheduleInactivityTimeout = () => {
  clearInactivityTimer();
  inactivityTimer = setTimeout(triggerInactivityLogout, INACTIVITY_TIMEOUT_MS);
};

const bindInactivityEvents = () => {
  ["pointerdown", "keydown", "mousemove", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, scheduleInactivityTimeout, { passive: true });
  });
};

const unbindInactivityEvents = () => {
  ["pointerdown", "keydown", "mousemove", "touchstart"].forEach((eventName) => {
    window.removeEventListener(eventName, scheduleInactivityTimeout, { passive: true });
  });
};

const hydrateSessionState = async () => {
  try {
    const state = await fetchJsonWithFallback(["/api/admin/session"]);
    csrfToken = state?.csrfToken || "";
    if (state?.authenticated) {
      return true;
    }
  } catch {
    // Ignore session bootstrap errors and allow manual login.
  }

  return false;
};

if (authForm && notice && tableBody) {
  loadLocaleDictionary(activeLocale).finally(() => {
    syncSearchPlaceholder();
    updatePagerUi();
  });

  setDashboardVisibility(false);
  loadDeliveryStatus();
  bindInactivityEvents();
  hydrateSessionState().then((authenticated) => {
    if (authenticated) {
      scheduleInactivityTimeout();
      authForm.requestSubmit();
    }
  });

  const scheduleAutoLoad = () => {
    const username = adminUserInput?.value?.trim() || "";
    const password = adminPassInput?.value || "";

    if (!username || !password) {
      return;
    }

    if (autoLoadTimer) {
      clearTimeout(autoLoadTimer);
    }

    autoLoadTimer = setTimeout(() => {
      const fingerprint = `${username}:${password}`;
      if (isLoadingMessages || fingerprint === lastAttemptFingerprint) {
        return;
      }

      authForm.requestSubmit();
    }, 500);
  };

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = adminUserInput?.value || "";
    const password = adminPassInput?.value || "";
    const otp = adminOtpInput?.value?.trim() || "";
    const hasCredentials = Boolean(username && password);

    if (!hasCredentials && !csrfToken) {
      notice.textContent = t(
        "admin_credentials_required",
        activeLocale === "nl"
          ? "Gebruikersnaam en wachtwoord zijn verplicht."
          : "Username and password are required."
      );
      notice.className = "notice error";
      return;
    }

    const token = btoa(`${username}:${password}`);
    const currentFingerprint = `${username}:${password}`;

    isLoadingMessages = true;
    lastAttemptFingerprint = currentFingerprint;

    notice.textContent = t("admin_loading_messages", activeLocale === "nl" ? "Berichten laden..." : "Loading messages...");
    notice.className = "notice";

    try {
      if (hasCredentials) {
        const loginResponse = await fetch("/api/admin/login", {
          method: "POST",
          headers: {
            Authorization: `Basic ${token}`,
            ...(otp ? { "X-Admin-OTP": otp } : {})
          }
        });

        if (!loginResponse.ok && loginResponse.status !== 401 && loginResponse.status !== 429) {
          throw new Error(t("admin_login_failed_status", activeLocale === "nl"
            ? `Admin-aanmelding mislukt met status ${loginResponse.status}.`
            : `Admin login failed with status ${loginResponse.status}.`));
        }

        const loginBody = await loginResponse.json().catch(() => null);
        if (!loginResponse.ok) {
          const error = new Error(loginBody?.message || t("admin_unauthorized", activeLocale === "nl" ? "Niet geautoriseerd" : "Unauthorized"));
          error.retryAfterSec = loginBody?.retryAfterSec;
          error.attemptsRemaining = loginBody?.attemptsRemaining;
          throw error;
        }

        csrfToken = loginBody?.csrfToken || csrfToken;
      }

      allMessages = await fetchJsonWithFallback(["/api/messages", "/api/messages.php"]);

      currentPage = 1;
      setDashboardVisibility(true);
      window.dispatchEvent(new CustomEvent("admin:session-changed", { detail: { authenticated: true } }));
      render();
      const loadedLabel = t("admin_loaded_messages", activeLocale === "nl" ? "Geladen" : "Loaded");
      const messagesLabel = t("admin_pager_messages", activeLocale === "nl" ? "bericht(en)" : "message(s)");
      notice.textContent = `${loadedLabel} ${allMessages.length} ${messagesLabel}.`;
      notice.className = "notice success";
      loadAdminMetrics();
      loadQueueHealth();
      loadPerformanceMetrics();
      loadStorageStatus();
      loadReportSummary();
      loadAuditEvents();
      scheduleInactivityTimeout();
    } catch (error) {
      setDashboardVisibility(false);
      window.dispatchEvent(new CustomEvent("admin:session-changed", { detail: { authenticated: false } }));
      tableBody.innerHTML = `<tr><td colspan="6">${t("admin_could_not_load_messages", activeLocale === "nl" ? "Kon berichten niet laden." : "Could not load messages.")}</td></tr>`;
      allMessages = [];
      filteredMessages = [];
      const retryAfter = Number(error?.retryAfterSec || 0);
      const attemptsRemaining = Number.isFinite(error?.attemptsRemaining)
        ? Number(error.attemptsRemaining)
        : null;

      if (retryAfter > 0) {
        const retryLabel = t("admin_retry_in", activeLocale === "nl" ? "Opnieuw proberen over ongeveer" : "Retry in about");
        const secLabel = t("admin_seconds", activeLocale === "nl" ? "seconde(n)" : "second(s)");
        notice.textContent = `${error.message} ${retryLabel} ${retryAfter} ${secLabel}.`;
      } else if (attemptsRemaining !== null && attemptsRemaining >= 0) {
        const attemptsLabel = t("admin_attempts_remaining", activeLocale === "nl" ? "Pogingen over" : "Attempts remaining");
        notice.textContent = `${error.message} ${attemptsLabel}: ${attemptsRemaining}.`;
      } else {
        notice.textContent = error.message;
      }
      notice.className = "notice error";
      if (pageInfo) {
        pageInfo.textContent = "";
      }
    } finally {
      isLoadingMessages = false;
    }
  });

  adminUserInput?.addEventListener("input", scheduleAutoLoad);
  adminPassInput?.addEventListener("input", scheduleAutoLoad);

  searchInput?.addEventListener("input", () => {
    currentPage = 1;
    render();
  });

  pageSizeSelect?.addEventListener("change", () => {
    pageSize = Number(pageSizeSelect.value || 10);
    currentPage = 1;
    render();
  });

  prevButton?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      render();
    }
  });

  nextButton?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filteredMessages.length / pageSize));
    if (currentPage < totalPages) {
      currentPage += 1;
      render();
    }
  });

  exportButton?.addEventListener("click", () => {
    if (!filteredMessages.length) {
      notice.textContent = t(
        "admin_no_messages_export",
        activeLocale === "nl"
          ? "Geen berichten beschikbaar om te exporteren."
          : "No messages available to export."
      );
      notice.className = "notice error";
      return;
    }

    downloadCsv(filteredMessages);
    const exportedLabel = t("admin_exported", activeLocale === "nl" ? "Geëxporteerd" : "Exported");
    const messagesLabel = t("admin_pager_messages", activeLocale === "nl" ? "bericht(en)" : "message(s)");
    const toCsvLabel = t("admin_to_csv", activeLocale === "nl" ? "naar CSV" : "to CSV");
    notice.textContent = `${exportedLabel} ${filteredMessages.length} ${messagesLabel} ${toCsvLabel}.`;
    notice.className = "notice success";
  });

  logoutButton?.addEventListener("click", () => {
    allMessages = [];
    filteredMessages = [];
    currentPage = 1;

    if (searchInput) {
      searchInput.value = "";
    }

    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="6">${t("admin_table_empty", activeLocale === "nl" ? "Nog geen gegevens geladen." : "No data loaded yet.")}</td></tr>`;
    }

    if (pageInfo) {
      pageInfo.textContent = "";
    }

    if (adminPassInput) {
      adminPassInput.value = "";
    }

    if (adminOtpInput) {
      adminOtpInput.value = "";
    }

    if (auditOutput) {
      auditOutput.innerHTML = "<p class=\"audit-empty\">No audit data loaded yet.</p>";
      auditOutput.dataset.rawEvents = "[]";
    }

    if (performanceOutput) {
      performanceOutput.innerHTML = "<p class=\"audit-empty\">No performance metrics loaded yet.</p>";
    }

    if (autoLoadTimer) {
      clearTimeout(autoLoadTimer);
      autoLoadTimer = null;
    }

    lastAttemptFingerprint = "";
    isLoadingMessages = false;
    const tokenForLogout = csrfToken;

    fetch("/api/admin/logout", {
      method: "POST",
      headers: tokenForLogout
        ? {
          "X-CSRF-Token": tokenForLogout
        }
        : {}
    }).catch(() => {});

    csrfToken = "";
    clearInactivityTimer();
    unbindInactivityEvents();

    setDashboardVisibility(false);
    window.dispatchEvent(new CustomEvent("admin:session-changed", { detail: { authenticated: false } }));
    notice.textContent = t("admin_logged_out", activeLocale === "nl" ? "Uitgelogd." : "Logged out.");
    notice.className = "notice";
    if (window.toast) {
      window.toast.info(t("admin_logged_out_success", activeLocale === "nl" ? "Succesvol uitgelogd." : "Logged out successfully."));
    }
  });

  auditRefreshButton?.addEventListener("click", () => {
    loadAuditEvents();
  });

  auditFilter?.addEventListener("change", () => {
    const events = parseJsonSafely(auditOutput?.dataset?.rawEvents || "[]") || [];
    setAuditOutput(events);
  });

  queueRefreshButton?.addEventListener("click", loadQueueHealth);
  queueProcessButton?.addEventListener("click", processQueue);
  queuePauseButton?.addEventListener("click", () => {
    postQueueAction("/api/admin/queue/pause", "Queue worker paused.", "Failed to pause queue worker.");
  });
  queueResumeButton?.addEventListener("click", () => {
    postQueueAction("/api/admin/queue/resume", "Queue worker resumed.", "Failed to resume queue worker.");
  });
  queueClearButton?.addEventListener("click", () => {
    const shouldClear = window.confirm("Clear all queued jobs? This action cannot be undone.");
    if (!shouldClear) {
      return;
    }

    postQueueAction("/api/admin/queue/clear", "Queue cleared.", "Failed to clear queue.");
  });
  summaryLoadButton?.addEventListener("click", loadReportSummary);
}

