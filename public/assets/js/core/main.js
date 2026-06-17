const navLinks = document.querySelector(".nav-links");
const menuButton = document.querySelector(".menu-toggle");

if (menuButton && navLinks) {
  menuButton.addEventListener("click", () => {
    navLinks.classList.toggle("open");
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

