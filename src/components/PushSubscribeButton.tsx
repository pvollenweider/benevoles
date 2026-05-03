"use client"

import { useEffect, useState } from "react"

type State = "idle" | "loading" | "subscribed" | "denied" | "unsupported" | "no-vapid"

export default function PushSubscribeButton({ email }: { email: string }) {
  const [state, setState] = useState<State>("idle")

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported")
      return
    }
    // Check if already subscribed
    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) setState("subscribed")
      })
    ).catch(() => {})
  }, [])

  if (state === "unsupported" || state === "no-vapid") return null

  async function handleSubscribe() {
    setState("loading")
    try {
      const { publicKey } = await fetch("/api/public/push").then((r) => r.json())
      if (!publicKey) { setState("no-vapid"); return }

      const reg = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        const perm = await Notification.requestPermission()
        if (perm !== "granted") { setState("denied"); return }

        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
        })
      }

      const json = sub.toJSON()
      await fetch("/api/public/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          endpoint: json.endpoint,
          auth: json.keys?.auth ?? "",
          p256dh: json.keys?.p256dh ?? "",
        }),
      })

      setState("subscribed")
    } catch {
      setState("idle")
    }
  }

  if (state === "subscribed") {
    return (
      <p className="text-xs text-green-600 flex items-center gap-1">
        <span>✓</span> Rappels push activés
      </p>
    )
  }

  if (state === "denied") {
    return (
      <p className="text-xs text-gray-400">
        Notifications bloquées dans les paramètres du navigateur.
      </p>
    )
  }

  return (
    <button
      onClick={handleSubscribe}
      disabled={state === "loading"}
      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1.5 disabled:opacity-50"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {state === "loading" ? "Activation…" : "Recevoir des rappels push"}
    </button>
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}
