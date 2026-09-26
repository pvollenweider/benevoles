"use client"

import { useState, useSyncExternalStore } from "react"

// Both icons always render; which one is visible is driven purely by the `dark` class already on
// <html> (set by the inline script in layout.tsx before hydration, or by toggle() below) — never
// by React state directly. isDark below only drives aria-pressed/the announcement wording.

// Nothing outside toggle() ever mutates the class, so there's no real external event to
// subscribe to — toggle()'s own setAnnouncement call already triggers the re-render that picks
// up the new getSnapshot() value. useSyncExternalStore (not useState+useEffect) is what lets
// getServerSnapshot supply a definite value during SSR/hydration without a lint-flagged
// setState-in-effect correction afterward.
function subscribe() {
  return () => {}
}
function getSnapshot() {
  return document.documentElement.classList.contains("dark")
}
function getServerSnapshot() {
  return false
}

export default function DocThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [announcement, setAnnouncement] = useState("")

  function toggle() {
    const root = document.documentElement
    const next = !root.classList.contains("dark")
    root.classList.toggle("dark", next)
    try {
      localStorage.setItem("doc-theme", next ? "dark" : "light")
    } catch {
      // Private browsing / storage disabled — the choice just won't survive a reload.
    }
    setAnnouncement(next ? "Thème sombre activé." : "Thème clair activé.")
  }

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
      <button
        type="button"
        onClick={toggle}
        aria-label="Changer de thème (clair / sombre)"
        aria-pressed={isDark}
        className="p-2 -m-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800 transition-colors"
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
