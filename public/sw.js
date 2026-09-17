// Push notifications only. There is deliberately no fetch handler and no
// cache: the app's whole point is freshly filed items, and Next's useOffline
// already covers flaky connections. See docs/ARCHITECTURE_PLAN.md section 15.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "TR Assistant", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "TR Assistant", {
      body: data.body || "",
      icon: "/icons/192.png",
      badge: "/icons/192.png",
      tag: data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => "focus" in w);
      if (open) {
        return open.focus().then((w) => ("navigate" in w ? w.navigate(url) : undefined));
      }
      return self.clients.openWindow(url);
    }),
  );
});
