"use client"

import { useEffect, useRef, useState } from "react"

type State = "idle" | "loading" | "subscribed" | "denied" | "unsupported" | "no-vapid"

export default function PushSubscribeButton({ editToken }: { editToken: string }) {
  const [state, setState] = useState<State>(() => {
    if (typeof window === "undefined") return "idle"
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported"
    return "idle"
  })

  useEffect(() => {
    // Async-only: check whether the browser already holds a subscription. If so, (re)link it to
    // this volunteer server-side: the browser subscription is per device, not per volunteer, and
    // the server-side one may be missing (another volunteer on the same device, or dropped).
    navigator.serviceWorker?.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!sub) return
        setState("subscribed")
        return saveSubscription(sub, editToken)
      })
      .catch(() => {})
  }, [editToken])

  const statusRef = useRef<HTMLParagraphElement>(null)
  // Set on click: once the button it came from unmounts, focus moves to the outcome message
  // instead of falling back to <body>. Not on mount (an already-subscribed browser) — that
  // would steal focus on page load.
  const movedFromButton = useRef(false)
  useEffect(() => {
    if (movedFromButton.current && (state === "subscribed" || state === "denied")) {
      movedFromButton.current = false
      statusRef.current?.focus()
    }
  }, [state])

  if (state === "unsupported" || state === "no-vapid") return null

  async function handleSubscribe() {
    movedFromButton.current = true
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

      await saveSubscription(sub, editToken)
      setState("subscribed")
    } catch {
      movedFromButton.current = false
      setState("idle")
    }
  }

  const showButton = state === "idle" || state === "loading"

  // The status region stays mounted across states so screen readers announce the outcome
  // (a live region inserted together with its text isn't reliably announced).
  return (
    <div>
      {showButton && (
        <button
          onClick={handleSubscribe}
          disabled={state === "loading"}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1.5 disabled:opacity-50"
        >
          <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {state === "loading" ? "Activation…" : "Recevoir des rappels push"}
        </button>
      )}
      <p
        ref={statusRef}
        role="status"
        tabIndex={-1}
        className={`text-xs flex items-center gap-1 focus:outline-none ${state === "subscribed" ? "text-green-700" : "text-gray-600"}`}
      >
        {state === "subscribed" && <><span aria-hidden="true">✓</span> Rappels push activés</>}
        {state === "denied" && "Notifications bloquées dans les paramètres du navigateur."}
      </p>
    </div>
  )
}

async function saveSubscription(sub: PushSubscription, editToken: string): Promise<void> {
  const json = sub.toJSON()
  const res = await fetch("/api/public/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      editToken,
      endpoint: json.endpoint,
      auth: json.keys?.auth ?? "",
      p256dh: json.keys?.p256dh ?? "",
    }),
  })
  if (!res.ok) throw new Error(`push subscribe failed: ${res.status}`)
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}
