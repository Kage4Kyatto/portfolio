const navLinks = document.querySelector(".nav-links");
const menuButton = document.querySelector(".menu-toggle");

if (menuButton && navLinks) {
  menuButton.addEventListener("click", () => {
    navLinks.classList.toggle("open");
  });
}

const path = window.location.pathname;
const links = document.querySelectorAll(".nav-links a");

links.forEach((link) => {
  const href = link.getAttribute("href");
  if (href && (path.endsWith(href) || (path === "/" && href === "/index.html"))) {
    link.classList.add("active");
  }
});

const revealItems = document.querySelectorAll(".reveal");
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

revealItems.forEach((item, index) => {
  item.style.transitionDelay = `${index * 70}ms`;
  observer.observe(item);
});

const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

const root = document.documentElement;
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
