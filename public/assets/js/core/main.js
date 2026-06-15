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
