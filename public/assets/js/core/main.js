const navLinks = document.querySelector(".nav-links");
const menuButton = document.querySelector(".menu-toggle");

if (menuButton && navLinks) {
  menuButton.addEventListener("click", () => {
    navLinks.classList.toggle("open");
  });
}

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

const initCalmModePlayer = () => {
  const storageKeys = {
    enabled: "portfolio.calmMode.enabled",
    volume: "portfolio.calmMode.volume"
  };
  const trackUrl = "/assets/audio/calm-mode.wav";
  const savedEnabled = window.localStorage.getItem(storageKeys.enabled) === "true";
  const parsedVolume = Number.parseFloat(window.localStorage.getItem(storageKeys.volume) || "0.35");
  const savedVolume = Number.isFinite(parsedVolume) ? Math.min(Math.max(parsedVolume, 0), 1) : 0.35;

  const panel = document.createElement("section");
  panel.className = "calm-player";
  panel.setAttribute("aria-label", "Background calm music controls");

  panel.innerHTML = `
    <button type="button" class="calm-player__toggle" aria-pressed="false">Calm Mode: Off</button>
    <label class="calm-player__volume-wrap" for="calm-volume-input">
      <span class="calm-player__volume-label">Volume</span>
      <input id="calm-volume-input" class="calm-player__volume" type="range" min="0" max="1" step="0.05" value="${savedVolume}" />
    </label>
    <p class="calm-player__status" aria-live="polite">Tap Calm Mode to start music.</p>
  `;

  document.body.appendChild(panel);

  const toggleButton = panel.querySelector(".calm-player__toggle");
  const volumeInput = panel.querySelector(".calm-player__volume");
  const status = panel.querySelector(".calm-player__status");

  if (!toggleButton || !volumeInput || !status) {
    return;
  }

  const audio = new Audio(trackUrl);
  audio.loop = true;
  audio.preload = "none";
  audio.volume = savedVolume;

  let isEnabled = savedEnabled;

  const setStatus = (message) => {
    status.textContent = message;
  };

  const syncToggleUi = () => {
    toggleButton.setAttribute("aria-pressed", String(isEnabled));
    toggleButton.textContent = isEnabled ? "Calm Mode: On" : "Calm Mode: Off";
    panel.classList.toggle("is-on", isEnabled);
  };

  const saveEnabledState = () => {
    window.localStorage.setItem(storageKeys.enabled, String(isEnabled));
  };

  const startPlayback = async () => {
    try {
      await audio.play();
      setStatus("Playing calm instrumental background music.");
      return true;
    } catch {
      setStatus("Audio blocked until interaction. Tap Calm Mode again.");
      return false;
    }
  };

  const stopPlayback = () => {
    audio.pause();
    setStatus("Calm music paused.");
  };

  toggleButton.addEventListener("click", async () => {
    isEnabled = !isEnabled;
    syncToggleUi();
    saveEnabledState();

    if (isEnabled) {
      await startPlayback();
      return;
    }

    stopPlayback();
  });

  volumeInput.addEventListener("input", () => {
    const nextVolume = Number.parseFloat(volumeInput.value);

    if (!Number.isFinite(nextVolume)) {
      return;
    }

    audio.volume = Math.min(Math.max(nextVolume, 0), 1);
    window.localStorage.setItem(storageKeys.volume, String(audio.volume));
  });

  audio.addEventListener("error", () => {
    setStatus("Could not load track. Check connection or replace the music URL.");
    isEnabled = false;
    syncToggleUi();
    saveEnabledState();
  });

  syncToggleUi();

  if (isEnabled) {
    setStatus("Calm Mode is on. Tap anywhere if playback is blocked.");
    const tryResume = async () => {
      const started = await startPlayback();
      if (started) {
        window.removeEventListener("pointerdown", tryResume);
        window.removeEventListener("keydown", tryResume);
      }
    };

    window.addEventListener("pointerdown", tryResume, { once: true, passive: true });
    window.addEventListener("keydown", tryResume, { once: true });
  }
};

initCalmModePlayer();
