/**
 * SmartSpend PWA Service Worker (Workbox InjectManifest mode).
 * Provides 100% offline coverage for compiled chunks and dynamic caching for assets.
 */
importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js",
);

const RUNTIME_CACHE = "smartspend-runtime-v4";
const IMAGE_CACHE = "smartspend-images-v4";
const MAX_IMAGE_ENTRIES = 64;

// Enable Workbox debugging if needed (will output to console in dev mode)
if (self.workbox) {
  self.workbox.setConfig({ debug: false });
}

// 1. Precaching: VitePWA compiles all assets and injects them here.
// Note: self.__WB_MANIFEST must appear EXACTLY ONCE in the source file.
const precachedAssets = self.__WB_MANIFEST;
if (precachedAssets) {
  self.workbox.precaching.precacheAndRoute(precachedAssets);
}

// Helper to identify API and server transactions
function isApiRequest(url) {
  const p = url.pathname;
  return p.startsWith("/api") || p.includes("/trpc");
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

// 2. Offline Background Sync for Mutations (POST / DELETE)
const bgSyncPlugin = new self.workbox.backgroundSync.BackgroundSyncPlugin(
  "smartspend-offline-queue",
  {
    maxRetentionTime: 24 * 60, // Retry for max of 24 Hours (specified in minutes)
    onSync: async ({ queue }) => {
      try {
        await queue.replayRequests();
        // Notify clients that sync was successful so they can show a toast or refresh data
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) =>
            client.postMessage({ type: "OFFLINE_SYNC_SUCCESS" }),
          );
        });
      } catch (error) {
        console.error("Background sync failed:", error);
      }
    },
  },
);

self.workbox.routing.registerRoute(
  isApiRequest,
  new self.workbox.strategies.NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  "POST",
);

self.workbox.routing.registerRoute(
  isApiRequest,
  new self.workbox.strategies.NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  "DELETE",
);

// 3. Fetch interceptions for GET requests
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;

  // Always bypass API / TRPC calls for GET (do not cache server data)
  if (isApiRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // Navigation requests: Try network first, fall back to cached index.html or offline.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) return response;
          throw new Error("Network response not OK");
        })
        .catch(async () => {
          const cached =
            (await caches.match("/index.html")) ||
            (await caches.match("/offline.html"));
          return cached || Response.error();
        }),
    );
    return;
  }

  // Dynamic Image caching using Stale-While-Revalidate
  if (request.destination === "image") {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(request, networkResponse.clone());
              // Enforce limit of images in cache
              cache.keys().then((keys) => {
                if (keys.length > MAX_IMAGE_ENTRIES) {
                  cache.delete(keys[0]);
                }
              });
            }
            return networkResponse;
          })
          .catch(() => null);

        return cachedResponse || fetchPromise || Response.error();
      }),
    );
    return;
  }

  // Generic static assets fall back to precache / cache
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request)
        .then((networkResponse) => {
          if (networkResponse.ok && !isApiRequest(url)) {
            const cacheCopy = networkResponse.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, cacheCopy);
            });
          }
          return networkResponse;
        })
        .catch(() => Response.error());
    }),
  );
});

// 3. Message handling (SKIP_WAITING triggered by registration toast)
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// 4. Cleanup old caches on activation
self.addEventListener("activate", (event) => {
  const currentCaches = [RUNTIME_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Clear any old smartspend shell / runtime caches
            if (
              cacheName.startsWith("smartspend-") &&
              !currentCaches.includes(cacheName)
            ) {
              return caches.delete(cacheName);
            }
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// 5. Push Notifications
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || "SmartSpend AI";
    const options = {
      body: data.body || "",
      icon: data.icon || "/pwa-192x192.png",
      badge: data.badge || "/pwa-192x192.png",
      vibrate: [100, 50, 100],
      data: data.url || "/", // Default URL to open when clicked
    };

    const promises = [self.registration.showNotification(title, options)];

    // Premium PWA App Badging: Set home screen app badge dynamically
    if (self.navigator && "setAppBadge" in self.navigator) {
      promises.push(self.navigator.setAppBadge(1).catch(() => {}));
    }

    event.waitUntil(Promise.all(promises));
  } catch (err) {
    console.error("Push event error:", err);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = new URL(
    event.notification.data || "/",
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there is already a window/tab open with the target URL
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          // If so, just focus it.
          if (client.url === urlToOpen && "focus" in client) {
            return client.focus();
          }
        }
        // If not, then open the target URL in a new window/tab.
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      }),
  );
});
