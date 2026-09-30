"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

// The `dark` class lives on the content shell's own root ([data-theme-scope], see
// src/components/public/ContentShell.tsx), never on <html>: leaving the features page or the
// documentation for the home page must not carry the dark theme along. Both icons always render;
// which one shows is driven by that class. isDark only drives aria-pressed and the announcement.

const EVENT = "doc-theme-change"
const scope = () => document.querySelector<HTMLElement>("[data-theme-scope]")

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  return () => window.removeEventListener(EVENT, onChange)
}
function getSnapshot() {
  return scope()?.classList.contains("dark") ?? false
}
function getServerSnapshot() {
  return false
}

/** The saved choice, else the OS/browser preference. */
function preferredDark(): boolean {
  try {
    const stored = localStorage.getItem("doc-theme")
    if (stored) return stored === "dark"
  } catch {
    // Storage disabled: fall back to the system preference.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export default function DocThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [announcement, setAnnouncement] = useState("")

  // The inline script only runs on a full page load; arriving by client navigation (from the home
  // page's « Voir toutes les fonctionnalités »), apply the preference here.
  useEffect(() => {
    scope()?.classList.toggle("dark", preferredDark())
    window.dispatchEvent(new Event(EVENT))
  }, [])

  function toggle() {
    const root = scope()
    if (!root) return
    const next = !root.classList.contains("dark")
    root.classList.toggle("dark", next)
    try {
      localStorage.setItem("doc-theme", next ? "dark" : "light")
    } catch {
      // Private browsing / storage disabled — the choice just won't survive a reload.
    }
    window.dispatchEvent(new Event(EVENT))
    setAnnouncement(next ? "Thème sombre activé." : "Thème clair activé.")
  }

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
      <button
        type="button"
        onClick={toggle}
        aria-label="Thème sombre"
        aria-pressed={isDark}
        className="p-2 -m-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"
      >
        <svg aria-hidden="true" className="w-4 h-4 dark:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
        <svg aria-hidden="true" className="w-4 h-4 hidden dark:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      </button>
    </>
  )
}
