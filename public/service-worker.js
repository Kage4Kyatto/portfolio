const CACHE_NAME = "portfolio-cache-v3";
const PRE_CACHE = [
  "/index.html",
  "/about.html",
  "/projects.html",
  "/services.html",
  "/contact.html",
  "/assets/css/styles.css",
  "/assets/js/core/main.js",
  "/favicon.svg"
];

const isLocaleRequest = (requestUrl) => requestUrl.pathname.startsWith("/assets/i18n/");
const isDynamicAssetRequest = (requestUrl) =>
  requestUrl.pathname.startsWith("/assets/js/") ||
  requestUrl.pathname.startsWith("/assets/css/");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRE_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (isLocaleRequest(requestUrl) || isDynamicAssetRequest(requestUrl) || event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }

          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);
          });

          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) {
          return response;
        }

        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, cloned);
        });

        return response;
      });
    })
  );
});
