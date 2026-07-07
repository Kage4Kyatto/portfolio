// Updated 2026-07-07
const THEME_STORAGE_KEY = "portfolio.theme";

const getSystemTheme = () => {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const getSavedTheme = () => {
  return localStorage.getItem(THEME_STORAGE_KEY);
};

const applyTheme = (theme) => {
  const isDark = theme === "dark";
  const isLight = theme === "light";

  if (isDark) {
    document.body.classList.remove("light-mode");
    document.body.classList.add("dark-mode");
  } else if (isLight) {
    document.body.classList.remove("dark-mode");
    document.body.classList.add("light-mode");
  }

  localStorage.setItem(THEME_STORAGE_KEY, theme);
};

const initTheme = () => {
  let theme = getSavedTheme() || getSystemTheme();
  applyTheme(theme);
  return theme;
};

const toggleTheme = () => {
  const current = getSavedTheme() || getSystemTheme();
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
};

const setupThemeToggle = () => {
  const existingToggle = document.querySelector(".theme-toggle");
  if (existingToggle) {
    return;
  }

  const toggle = document.createElement("button");
  toggle.className = "theme-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Toggle dark/light mode");
  toggle.title = "Toggle theme";
  toggle.innerHTML = "ðŸŒ™";

  toggle.addEventListener("click", () => {
    const newTheme = toggleTheme();
    toggle.innerHTML = newTheme === "dark" ? "â˜€ï¸" : "ðŸŒ™";
  });

  const navLinks = document.querySelector(".nav-links");
  if (navLinks) {
    const li = document.createElement("li");
    li.appendChild(toggle);
    navLinks.insertBefore(li, navLinks.firstChild);

    const current = getSavedTheme() || getSystemTheme();
    toggle.innerHTML = current === "dark" ? "â˜€ï¸" : "ðŸŒ™";
  }
};

initTheme();
setupThemeToggle();

window.theme = {
  init: initTheme,
  apply: applyTheme,
  toggle: toggleTheme,
  getCurrent: getSavedTheme,
  getSystem: getSystemTheme
};

