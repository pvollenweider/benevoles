self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Rappel bénévole", {
      body: data.body ?? "",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: data.tag ?? "benevol-reminder",
      data: { url: data.url ?? "/" },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  // Only an address of this site, compared whole: with several personal pages open (or installed),
  // focus the one the reminder is about, never another whose address merely contains it (#593).
  const target = new URL(event.notification.data?.url ?? "/", self.location.origin)
  const url = target.origin === self.location.origin ? target.href : new URL("/", self.location.origin).href
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        const existing = list.find((c) => new URL(c.url).href === url)
        if (existing) return existing.focus()
        return clients.openWindow(url)
      })
  )
})
