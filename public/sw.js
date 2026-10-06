// Planner service worker: offline app shell + push notifications.
const VERSION = "v1";
const SHELL = `planner-shell-${VERSION}`;
const STATIC = `planner-static-${VERSION}`;
const COLLECTIONS = ["tasks", "occurrences", "entries", "tags", "projects", "settings"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, cacheName, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(fallbackUrl ?? request, response.clone());
    }

    return response;
  } catch {
    const cached = await caches.match(fallbackUrl ?? request);
    if (cached) {
      return cached;
    }

    throw new Error("offline");
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC);
    await cache.put(request, response.clone());
  }

  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL, "/"));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(png|ico|svg|woff2?|webmanifest)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request, STATIC));
});

function readSession() {
  return new Promise((resolve) => {
    const req = indexedDB.open("planner", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const c of COLLECTIONS) {
        if (!db.objectStoreNames.contains(c)) {
          db.createObjectStore(c, { keyPath: "id" });
        }
      }

      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
    };
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      try {
        const get = req.result.transaction("meta", "readonly").objectStore("meta").get("sync");
        get.onsuccess = () => resolve(get.result ?? null);
        get.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    };
  });
}

async function handlePush() {
  const session = await readSession();
  if (!session) {
    return;
  }

  let notifications = [];
  try {
    const since = Date.now() - 15 * 60_000;
    const res = await fetch(`/api/push/pending?since=${since}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    notifications = (await res.json()).notifications ?? [];
  } catch {
    return;
  }

  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const visible = windows.some((c) => c.visibilityState === "visible");
  if (visible) {
    // The open app notifies (and rings) on its own with the same tags.
    return;
  }

  const shown = await self.registration.getNotifications();
  const shownTags = new Set(shown.map((n) => n.tag));
  for (const n of notifications) {
    if (shownTags.has(n.tag)) {
      continue;
    }

    await self.registration.showNotification(n.title, {
      body: n.body,
      tag: n.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: "/" },
    });
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(handlePush());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        return;
      }

      await self.clients.openWindow(event.notification.data?.url ?? "/");
    })(),
  );
});
