const navLinks = document.querySelector(".nav-links");
const menuButton = document.querySelector(".menu-toggle");
const LOCALE_STORAGE_KEY = "portfolio.locale";
const DEFAULT_EN_LOCALE = {
  menu_label: "Language",
  menu_en: "EN",
  menu_nl: "NL"
};

const ensureMainLandmark = () => {
  const mainEl = document.querySelector("main");
  if (!mainEl) {
    return null;
  }

  if (!mainEl.id) {
    mainEl.id = "main-content";
  }

  if (!mainEl.hasAttribute("tabindex")) {
    mainEl.setAttribute("tabindex", "-1");
  }

  return mainEl;
};

const ensureSkipLink = () => {
  const mainEl = ensureMainLandmark();
  if (!mainEl || document.querySelector(".skip-link")) {
    return;
  }

  const skipLink = document.createElement("a");
  skipLink.className = "skip-link";
  skipLink.href = `#${mainEl.id}`;
  skipLink.textContent = "Skip to content";
  document.body.insertBefore(skipLink, document.body.firstChild);
};

ensureSkipLink();

const ensureManifestLink = () => {
  if (document.querySelector("link[rel='manifest']")) {
    return;
  }

  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = "/manifest.webmanifest";
  document.head.appendChild(link);
};

const registerServiceWorker = async () => {
  if (!("serviceWorker" in navigator)) {
    console.debug("Service Workers not supported in this browser");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("/service-worker.js");
    console.info("Service Worker registered successfully:", registration.scope);

    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      // Check for updates periodically in production without frequent polling.
      setInterval(() => {
        registration.update().catch((err) => {
          console.warn("Service Worker update check failed:", err.message);
        });
      }, 60 * 60 * 1000);
    }
  } catch (error) {
    console.warn("Service Worker registration failed:", error.message);
    // App continues without PWA features - not fatal
  }
};

const sendTelemetry = (eventName) => {
  const payload = {
    event: eventName,
    path: window.location.pathname,
    locale: localStorage.getItem(LOCALE_STORAGE_KEY) || "en"
  };

  const asJson = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/telemetry", asJson);
    return;
  }

  fetch("/api/telemetry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    keepalive: true,
    body: asJson
  }).catch(() => {});
};

const applyLocale = (locale, dictionary) => {
  const languageLabel = document.querySelector(".lang-toggle__label");
  const languageButton = document.querySelector(".lang-toggle__button");

  if (languageLabel) {
    languageLabel.textContent = dictionary.menu_label || "Language";
  }

  if (languageButton) {
    languageButton.textContent = locale === "nl"
      ? (dictionary.menu_nl || "NL")
      : (dictionary.menu_en || "EN");
  }

  document.documentElement.setAttribute("lang", locale);

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.getAttribute("data-i18n");
    if (!key || !(key in dictionary)) {
      return;
    }

    element.textContent = dictionary[key];
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.getAttribute("data-i18n-placeholder");
    if (!key || !(key in dictionary)) {
      return;
    }

    element.setAttribute("placeholder", dictionary[key]);
  });

  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    const key = element.getAttribute("data-i18n-title");
    if (!key || !(key in dictionary)) {
      return;
    }

    element.setAttribute("title", dictionary[key]);
  });

  window.dispatchEvent(new CustomEvent("portfolio:locale-changed", {
    detail: { locale, dictionary }
  }));
};

const setupLanguageToggle = async () => {
  if (!navLinks || document.querySelector(".lang-toggle")) {
    return;
  }

  const wrapper = document.createElement("li");
  wrapper.className = "lang-toggle";

  const label = document.createElement("span");
  label.className = "lang-toggle__label";
  label.textContent = "Language";

  const button = document.createElement("button");
  button.className = "lang-toggle__button";
  button.type = "button";

  wrapper.appendChild(label);
  wrapper.appendChild(button);
  navLinks.appendChild(wrapper);

  const loadLocaleDictionary = async (locale) => {
    const response = await fetch(`/assets/i18n/${locale}.json`);
    if (!response.ok) {
      throw new Error("Locale unavailable");
    }
    return response.json();
  };

  let locale = localStorage.getItem(LOCALE_STORAGE_KEY) || "en";
  if (locale === "en") {
    applyLocale(locale, DEFAULT_EN_LOCALE);
  } else {
    try {
      const dictionary = await loadLocaleDictionary(locale);
      applyLocale(locale, dictionary);
    } catch {
      locale = "en";
      applyLocale(locale, DEFAULT_EN_LOCALE);
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
  }

  button.addEventListener("click", async () => {
    const nextLocale = locale === "en" ? "nl" : "en";
    if (nextLocale === "en") {
      locale = "en";
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      applyLocale(locale, DEFAULT_EN_LOCALE);
      sendTelemetry("language_toggle");
      return;
    }

    try {
      const dictionary = await loadLocaleDictionary(nextLocale);
      locale = nextLocale;
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      applyLocale(locale, dictionary);
      sendTelemetry("language_toggle");
    } catch {
      // Ignore toggle failure and keep current locale.
    }
  });
};

ensureManifestLink();
registerServiceWorker();
setupLanguageToggle();
sendTelemetry("pageview");

if (menuButton && navLinks) {
  if (!navLinks.id) {
    navLinks.id = "primary-navigation";
  }

  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-controls", navLinks.id);

  const setMenuOpen = (isOpen) => {
    navLinks.classList.toggle("open", isOpen);
    menuButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
  };

  menuButton.addEventListener("click", () => {
    const isOpen = navLinks.classList.contains("open");
    setMenuOpen(!isOpen);
  });

  document.addEventListener("click", (event) => {
    if (!navLinks.classList.contains("open")) {
      return;
    }

    const clickedInsideNav = navLinks.contains(event.target) || menuButton.contains(event.target);
    if (!clickedInsideNav) {
      setMenuOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navLinks.classList.contains("open")) {
      setMenuOpen(false);
      menuButton.focus();
    }
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 900px)").matches) {
        setMenuOpen(false);
      }
    });
  });
}

const backButtons = document.querySelectorAll("[data-go-back]");
backButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = "/index.html";
  });
});

const path = window.location.pathname;
const links = document.querySelectorAll(".nav-links a");

const normalizePath = (value) => {
  if (!value) {
    return "";
  }

  return value === "/" ? "/" : value.replace(/\/+$/, "");
};

const currentPath = normalizePath(path);

links.forEach((link) => {
  const href = link.getAttribute("href");
  const normalizedHref = normalizePath(href);
  const isHomeLink = normalizedHref === "/index.html";
  const isHomePath = currentPath === "/";
  const isActive =
    (isHomePath && isHomeLink) ||
    normalizedHref === currentPath;

  if (normalizedHref && isActive) {
    link.classList.add("active");
  }
});

const revealItems = document.querySelectorAll(".reveal");
if (revealItems.length > 0) {
  const isHomePage = document.body.classList.contains("home-page");
  const revealStartDelay = isHomePage ? 3950 : 0;
  const canObserve = "IntersectionObserver" in window;

  const startReveal = () => {
    revealItems.forEach((item, index) => {
      item.style.transitionDelay = `${index * 70}ms`;

      if (!canObserve) {
        item.classList.add("show");
      }
    });

    if (!canObserve) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("show");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    revealItems.forEach((item) => {
      observer.observe(item);
    });
  };

  if (revealStartDelay > 0) {
    window.setTimeout(startReveal, revealStartDelay);
  } else {
    startReveal();
  }
}

const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

const root = document.documentElement;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const hasFinePointer = window.matchMedia("(pointer: fine)").matches;

if (!prefersReducedMotion && hasFinePointer) {
  const glowEl = document.createElement("div");
  glowEl.className = "cursor-glow";
  document.body.appendChild(glowEl);

  let frameId = 0;
  let nextX = window.innerWidth / 2;
  let nextY = window.innerHeight * 0.18;

  const renderGlow = () => {
    root.style.setProperty("--cursor-x", `${nextX}px`);
    root.style.setProperty("--cursor-y", `${nextY}px`);
    frameId = 0;
  };

  const queueGlowUpdate = (event) => {
    nextX = event.clientX;
    nextY = event.clientY;
    document.body.style.setProperty("--cursor-glow-opacity", "1");

    if (!frameId) {
      frameId = window.requestAnimationFrame(renderGlow);
    }
  };

  window.addEventListener("pointermove", queueGlowUpdate, { passive: true });
  window.addEventListener("pointerleave", () => {
    document.body.style.setProperty("--cursor-glow-opacity", "0");
  });
  window.addEventListener("blur", () => {
    document.body.style.setProperty("--cursor-glow-opacity", "0");
  });
}

