// Updated 2026-07-07
const TOAST_DURATION_MS = 5000;

const createToastContainer = () => {
  const existing = document.querySelector(".toast-container");
  if (existing) {
    return existing;
  }

  const container = document.createElement("div");
  container.className = "toast-container";
  document.body.appendChild(container);
  return container;
};

const showToast = (message, type = "info") => {
  const container = createToastContainer();
  
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  
  // Create content container
  const content = document.createElement("span");
  content.textContent = message;
  toast.appendChild(content);

  // Add dismiss button for accessibility
  const dismissBtn = document.createElement("button");
  dismissBtn.className = "toast-dismiss";
  dismissBtn.setAttribute("aria-label", "Dismiss notification");
  dismissBtn.textContent = "×";
  
  const dismiss = () => {
    toast.classList.remove("toast--visible");
    setTimeout(() => {
      toast.remove();
    }, 300);
  };
  
  dismissBtn.addEventListener("click", dismiss);
  toast.appendChild(dismissBtn);

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast--visible");
  }, 10);

  const autoCloseTimer = setTimeout(() => {
    dismiss();
  }, TOAST_DURATION_MS);

  // Clear auto-close timer if user manually dismisses
  dismissBtn.addEventListener("click", () => {
    clearTimeout(autoCloseTimer);
  }, { once: true });

  return toast;
};

const showSuccess = (message) => showToast(message, "success");
const showError = (message) => showToast(message, "error");
const showInfo = (message) => showToast(message, "info");
const showWarning = (message) => showToast(message, "warning");

window.toast = {
  show: showToast,
  success: showSuccess,
  error: showError,
  info: showInfo,
  warning: showWarning
};

