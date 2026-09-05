/**
 * SmartSpend PWA Service Worker (Workbox InjectManifest mode).
 * Provides 100% offline coverage for compiled chunks and dynamic caching for assets.
 */
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { registerRoute, setCatchHandler } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";

const RUNTIME_CACHE = "smartspend-runtime-v4";
const IMAGE_CACHE = "smartspend-images-v4";
const MAX_IMAGE_ENTRIES = 64;

// 1. Precaching: VitePWA compiles all assets and injects them here.
// Note: self.__WB_MANIFEST must appear EXACTLY ONCE in the source file.
const precachedAssets = self.__WB_MANIFEST;
if (precachedAssets) {
  precacheAndRoute(precachedAssets);
  cleanupOutdatedCaches();
}
clientsClaim();

// Helper to identify API and server transactions
function isApiRequest(url) {
  const p = url.pathname;
  return p.startsWith("/api") || p.includes("/trpc");
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

// 2. Never replay arbitrary mutations from a service worker. Replaying a stale
// POST/DELETE can duplicate a transaction or apply a later-unwanted settings,
// billing, or deletion action. ExpenseForm owns a visible outbox; its expense
// writes carry a server-enforced idempotency key and remain reviewable.

// 3. Workbox routing for GET requests
// FIX: Replaced the custom `fetch` event listener with Workbox registerRoute calls.
// The raw listener was intercepting ALL requests before Workbox routing could run,
// causing double-caching for precached assets and bypassing Workbox strategies.

// 3a. User-specific API/tRPC reads stay network-only. Cache Storage keys do not
// reliably isolate responses by authenticated user, while React Query handles
// the in-app cache for the active session.

// 3b. Navigation requests — serve the versioned precached app shell
// immediately. The registration flow updates the worker out of band, so an
// offline/cold launch never waits on a network timeout before showing UI.
registerRoute(
  ({ request }) => request.mode === "navigate",
  createHandlerBoundToURL("/index.html"),
);

setCatchHandler(async ({ event }) => {
  if (event.request.mode === "navigate") {
    return createHandlerBoundToURL("/index.html")({ event });
  }
  return Response.error();
});

// 3c. Image caching — StaleWhileRevalidate with max entries
registerRoute(
  ({ request }) => request.destination === "image",
  new StaleWhileRevalidate({
    cacheName: IMAGE_CACHE,
    plugins: [
      new ExpirationPlugin({
        maxEntries: MAX_IMAGE_ENTRIES,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  }),
);

// 3d. Other same-origin static assets — StaleWhileRevalidate
registerRoute(
  ({ url, request }) =>
    isSameOrigin(url) &&
    !isApiRequest(url) &&
    request.destination !== "image" &&
    request.mode !== "navigate",
  new StaleWhileRevalidate({
    cacheName: RUNTIME_CACHE,
  }),
);

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
      icon: data.icon || "/icon-192.png",
      badge: data.badge || "/icon-192.png",
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

  let targetUrl = "/";
  const notificationData = event.notification.data;

  if (notificationData) {
    if (typeof notificationData === "string") {
      targetUrl = notificationData;
    } else if (typeof notificationData === "object") {
      // Support FCM payload formats, webpush format, and data object format
      targetUrl =
        notificationData.url ||
        notificationData.FCM_MSG?.data?.url ||
        notificationData.FCM_MSG?.notification?.click_action ||
        "/";
    }
  }

  const urlToOpen = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Find an open PWA window
        let matchingClient = null;
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (
            client.url.startsWith(self.location.origin) &&
            "focus" in client
          ) {
            matchingClient = client;
            break;
          }
        }

        if (matchingClient) {
          // Focus the existing window and send a navigation postMessage to avoid page reload
          return matchingClient.focus().then((client) => {
            client.postMessage({
              type: "NAVIGATE_TO",
              url: urlToOpen,
            });
          });
        }

        // If no window is open, open a new one
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      }),
  );
});
