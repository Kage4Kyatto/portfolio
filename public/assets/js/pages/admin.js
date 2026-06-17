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

let allMessages = [];
let filteredMessages = [];
let currentPage = 1;
let pageSize = Number(pageSizeSelect?.value || 10);
let isLoadingMessages = false;
let autoLoadTimer = null;
let lastAttemptFingerprint = "";
let csrfToken = "";
let inactivityTimer = null;
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

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

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

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

  pageInfo.textContent = `Showing ${startItem}-${endItem} of ${totalItems} message(s) | Page ${currentPage}/${totalPages}`;
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
    tableBody.innerHTML = '<tr><td colspan="6">No messages found.</td></tr>';
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
  let lastError = new Error("Request failed.");

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
        const requestError = new Error(parsed?.message || `Request failed with status ${response.status}.`);
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
        const parseError = new Error("API endpoint responded with non-JSON content.");

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

  deliveryStatus.textContent = "Email delivery status: checking...";
  deliveryStatus.className = "notice";

  try {
    const data = await fetchJsonWithFallback(["/api/health", "/api/health.php"]);
    const mode = data?.notifications?.mode || "disabled";

    if (mode === "resend") {
      deliveryStatus.textContent = "Email delivery mode: Resend API";
      deliveryStatus.className = "notice success";
      return;
    }

    if (mode === "php-mail-fallback") {
      deliveryStatus.textContent = "Email delivery mode: PHP mail() fallback";
      deliveryStatus.className = "notice";
      return;
    }

    deliveryStatus.textContent = "Email delivery mode: Disabled (CONTACT_NOTIFY_TO not set)";
    deliveryStatus.className = "notice error";
  } catch (error) {
    deliveryStatus.textContent = "Email delivery status unavailable.";
    deliveryStatus.className = "notice error";
  }
};

const loadAdminMetrics = async () => {
  if (!deliveryStatus) {
    return;
  }

  try {
    const result = await fetchJsonWithFallback(["/api/admin/metrics"]);
    const metrics = result?.metrics;
    if (!metrics) {
      return;
    }

    deliveryStatus.textContent = `${deliveryStatus.textContent} | Queue: ${metrics.queueDepth} | Lockouts: ${metrics.lockedAuthIps}`;
  } catch {
    // Metrics are optional and should not block page functionality.
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

  notice.textContent = "Session timed out due to inactivity.";
  notice.className = "notice error";
  if (window.toast) {
    window.toast.error("Session timed out due to inactivity.");
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
      notice.textContent = "Username and password are required.";
      notice.className = "notice error";
      return;
    }

    const token = btoa(`${username}:${password}`);
    const currentFingerprint = `${username}:${password}`;

    isLoadingMessages = true;
    lastAttemptFingerprint = currentFingerprint;

    notice.textContent = "Loading messages...";
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
          throw new Error(`Admin login failed with status ${loginResponse.status}.`);
        }

        const loginBody = await loginResponse.json().catch(() => null);
        if (!loginResponse.ok) {
          const error = new Error(loginBody?.message || "Unauthorized");
          error.retryAfterSec = loginBody?.retryAfterSec;
          error.attemptsRemaining = loginBody?.attemptsRemaining;
          throw error;
        }

        csrfToken = loginBody?.csrfToken || csrfToken;
      }

      allMessages = await fetchJsonWithFallback(["/api/messages", "/api/messages.php"]);

      currentPage = 1;
      setDashboardVisibility(true);
      render();
      notice.textContent = `Loaded ${allMessages.length} message(s).`;
      notice.className = "notice success";
      loadAdminMetrics();
      scheduleInactivityTimeout();
    } catch (error) {
      setDashboardVisibility(false);
      tableBody.innerHTML = '<tr><td colspan="6">Could not load messages.</td></tr>';
      allMessages = [];
      filteredMessages = [];
      const retryAfter = Number(error?.retryAfterSec || 0);
      const attemptsRemaining = Number.isFinite(error?.attemptsRemaining)
        ? Number(error.attemptsRemaining)
        : null;

      if (retryAfter > 0) {
        notice.textContent = `${error.message} Retry in about ${retryAfter} second(s).`;
      } else if (attemptsRemaining !== null && attemptsRemaining >= 0) {
        notice.textContent = `${error.message} Attempts remaining: ${attemptsRemaining}.`;
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
      notice.textContent = "No messages available to export.";
      notice.className = "notice error";
      return;
    }

    downloadCsv(filteredMessages);
    notice.textContent = `Exported ${filteredMessages.length} message(s) to CSV.`;
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
      tableBody.innerHTML = '<tr><td colspan="6">No data loaded yet.</td></tr>';
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

    setDashboardVisibility(false);
    notice.textContent = "Logged out.";
    notice.className = "notice";
    if (window.toast) {
      window.toast.info("Logged out successfully.");
    }
  });
}
