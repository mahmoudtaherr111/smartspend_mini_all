/**
 * SmartSpend PWA service worker (single stack — enhanced in place).
 * v3: network-first navigation, never cache API, bounded static/image caches.
 */
const SHELL_CACHE = "smartspend-shell-v3";
const STATIC_CACHE = "smartspend-static-v3";
const IMAGE_CACHE = "smartspend-images-v3";
const MAX_IMAGE_ENTRIES = 48;

const SHELL_URLS = ["/", "/index.html", "/manifest.json", "/icon.png", "/offline.html"];

function isApiRequest(url) {
  const p = url.pathname;
  return p.startsWith("/api") || p.includes("/trpc");
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isHashedAsset(pathname) {
  return /\/assets\/[^/]+-[a-zA-Z0-9_-]{8,}\.(js|css|woff2?)$/i.test(pathname);
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, STATIC_CACHE, IMAGE_CACHE]);
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map((name) => {
          if (!keep.has(name)) return caches.delete(name);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;

  if (isApiRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigate(request));
    return;
  }

  if (request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE, MAX_IMAGE_ENTRIES));
    return;
  }

  if (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "font" ||
    isHashedAsset(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE, 64));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function networkFirstNavigate(request) {
  try {
    const res = await fetch(request);
    if (res.ok) return res;
  } catch {
    /* offline */
  }
  const cached =
    (await caches.match(request)) ||
    (await caches.match("/index.html")) ||
    (await caches.match("/offline.html"));
  return cached || Response.error();
}

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res.ok) return res;
  } catch {
    /* offline */
  }
  const cached = await caches.match(request);
  return cached || Response.error();
}

async function staleWhileRevalidate(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const refresh = fetch(request)
    .then((res) => {
      if (res.ok) {
        cache.put(request, res.clone());
        void trimCache(cacheName, maxEntries);
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    void refresh;
    return cached;
  }

  return (await refresh) || (await caches.match("/offline.html")) || Response.error();
}
