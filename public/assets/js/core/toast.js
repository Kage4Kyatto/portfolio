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
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast--visible");
  }, 10);

  setTimeout(() => {
    toast.classList.remove("toast--visible");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, TOAST_DURATION_MS);

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
