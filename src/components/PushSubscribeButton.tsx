"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react"
import { announce } from "@/lib/announce"
import {
  PUSH_FAILURE_TEXT,
  pushRendersNothing,
  pushStateFromEnvironment,
  pushStateFromKey,
  pushStatusText,
  type PushState,
} from "@/lib/push-availability"

export default function PushSubscribeButton({ editToken }: { editToken: string }) {
  const [state, setState] = useState<PushState>(() => {
    if (typeof window === "undefined") return "checking"
    return pushStateFromEnvironment({ serviceWorker: "serviceWorker" in navigator, pushManager: "PushManager" in window })
  })
  // Failure of the last attempt, said in the status region while the button stays.
  const [failure, setFailure] = useState("")
  // The server's VAPID public key: undefined until known, null when the site has none.
  const publicKey = useRef<string | null | undefined>(undefined)
  const busy = useRef(false)

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return
    let cancelled = false
    // No button until the server says it offers push: without a VAPID key there is nothing to
    // subscribe to, and the button would only lead to an error.
    fetchPublicKey()
      .then((key) => {
        if (cancelled) return
        publicKey.current = key
        const next = pushStateFromKey(key)
        if (next === "no-vapid") { setState((s) => (s === "checking" ? next : s)); return }
        // Still « checking » (no button) until we know whether the browser already holds a
        // subscription: a button shown then replaced would drop a focus put on it. If there is one,
        // (re)link it to this volunteer server-side: the browser subscription is per device, not per
        // volunteer, and the server-side one may be missing (another volunteer on the same device,
        // or dropped). Only said to be active once the server accepted it. getRegistration, not
        // ready: ready never resolves when no service worker is registered.
        return navigator.serviceWorker.getRegistration()
          .then((reg) => reg?.pushManager.getSubscription() ?? null)
          .then(async (sub) => {
            if (cancelled) return
            if (!sub) { setState((s) => (s === "checking" ? next : s)); return }
            try {
              await saveSubscription(sub, editToken)
              if (!cancelled) setState((s) => (s === "checking" ? "subscribed" : s))
            } catch {
              if (!cancelled) setState((s) => (s === "checking" ? next : s))
            }
          })
      })
      .catch(() => {
        // Key unknown (network): offer the button, a press fetches the key again.
        if (!cancelled) setState((s) => (s === "checking" ? "idle" : s))
      })
    return () => { cancelled = true }
  }, [editToken])

  const statusRef = useRef<HTMLParagraphElement>(null)
  // Set on click: once the button it came from unmounts, focus moves to the outcome message
  // instead of falling back to <body>. Not on mount (an already-subscribed browser): that
  // would steal focus on page load. A failure keeps the button, and the focus on it.
  const movedFromButton = useRef(false)
  useEffect(() => {
    if (movedFromButton.current && (state === "subscribed" || state === "denied" || state === "unavailable")) {
      movedFromButton.current = false
      statusRef.current?.focus()
    }
  }, [state])

  if (pushRendersNothing(state)) return null

  async function handleSubscribe() {
    // The button stays focusable while loading (aria-disabled): a second press does nothing.
    if (busy.current || state !== "idle") return
    busy.current = true
    movedFromButton.current = true
    setFailure("")
    setState("loading")
    try {
      const key = publicKey.current ?? (await fetchPublicKey())
      publicKey.current = key
      if (pushStateFromKey(key) === "no-vapid") { setState("unavailable"); return }

      const reg = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        const perm = await Notification.requestPermission()
        if (perm !== "granted") { setState("denied"); return }

        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key!).buffer as ArrayBuffer,
        })
      }

      // Refused by the server too (e.g. a token that isn't an active registration's): said below.
      await saveSubscription(sub, editToken)
      setState("subscribed")
    } catch {
      movedFromButton.current = false
      setState("idle")
      announce(setFailure, PUSH_FAILURE_TEXT)
    } finally {
      busy.current = false
    }
  }

  const showButton = state === "idle" || state === "loading"
  const loading = state === "loading"

  // The status region stays mounted across states (checking included) so screen readers announce
  // the outcome (a live region inserted together with its text isn't reliably announced).
  return (
    <div>
      {showButton && (
        <button
          type="button"
          onClick={handleSubscribe}
          aria-disabled={loading || undefined}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1.5 aria-disabled:opacity-50"
        >
          <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {loading ? "Activation…" : "Recevoir des rappels push"}
        </button>
      )}
      <p
        ref={statusRef}
        role="status"
        tabIndex={-1}
        className={`text-xs flex items-center gap-1 focus:outline-none ${state === "subscribed" ? "text-green-700" : "text-gray-600"}`}
      >
        {state === "subscribed"
          ? <><span aria-hidden="true">✓</span> {pushStatusText(state)}</>
          : pushStatusText(state) || (showButton ? failure : "")}
      </p>
    </div>
  )
}

/** The server's VAPID public key, null when push isn't configured. Throws on a failed request. */
async function fetchPublicKey(): Promise<string | null> {
  const res = await fetch("/api/public/push")
  if (!res.ok) throw new Error(`push key fetch failed: ${res.status}`)
  const { publicKey } = (await res.json()) as { publicKey?: string | null }
  return publicKey ?? null
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
