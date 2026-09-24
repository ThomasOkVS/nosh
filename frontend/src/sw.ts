/// <reference lib="webworker" />
/**
 * The app's service worker. Until push notifications, vite-plugin-pwa
 * generated this file entirely (`generateSW`); now we write it ourselves
 * (`injectManifest`) because it needs `push`/`notificationclick` handlers,
 * and the plugin just injects the precache list into it at build time.
 *
 * Angular analogy: `@angular/service-worker` ships a prebuilt
 * `ngsw-worker.js` and exposes pushes to the app through `SwPush`. Here the
 * worker is our own code, but plays the same role — it runs even when no
 * tab of the app is open, which is what lets a notification arrive with the
 * app closed.
 */
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// Same offline/precache behaviour `generateSW` gave us: cache the built app
// shell, drop caches left over from older builds.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// `registerType: "autoUpdate"` semantics: a new deploy's worker takes over
// straight away instead of waiting for every tab to close.
void self.skipWaiting();
clientsClaim();

/** Mirrors `PushPayload` in backend/src/services/pushNotifier.ts. */
interface PushPayload {
  title: string;
  body: string;
  url: string;
}

function parsePayload(event: PushEvent): PushPayload {
  try {
    const data = event.data?.json() as Partial<PushPayload> | undefined;
    return {
      title: typeof data?.title === "string" ? data.title : "Nosh",
      body: typeof data?.body === "string" ? data.body : "",
      url: typeof data?.url === "string" ? data.url : "/",
    };
  } catch {
    return { title: "Nosh", body: "", url: "/" };
  }
}

// Every push must show a notification — the subscription is created with
// `userVisibleOnly: true`, and Safari revokes the subscription of a site
// whose pushes don't visibly notify. So no "skip it if the app is open"
// logic here, even though the app would also toast the same result.
self.addEventListener("push", (event) => {
  const payload = parsePayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      data: { url: payload.url },
    }),
  );
});

// Tapping the notification: reuse an open window of the app if there is
// one (navigating it to the import), otherwise launch the app there.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data as { url?: unknown } | null;
  const path = typeof data?.url === "string" && data.url.startsWith("/") ? data.url : "/";
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        await existing.focus();
        await existing.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
