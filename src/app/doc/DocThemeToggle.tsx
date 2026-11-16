"use client"

import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"

// The `dark` class lives on the content shell's own root ([data-theme-scope], see
// src/components/public/ContentShell.tsx), never on <html>: leaving the features page or the
// documentation for the home page must not carry the dark theme along. Both icons always render;
// which one shows is driven by that class. isDark only drives aria-pressed and the announcement.
// The toggle acts on its own frame (closest), never on the first one in the document, so it stays
// right even if two frames are ever on the page at once during a client navigation.

const EVENT = "doc-theme-change"
/** How long the frame's colours fade when the reader switches the theme (transition-colors: 150 ms). */
const SWITCH_MS = 200

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  return () => window.removeEventListener(EVENT, onChange)
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
  const button = useRef<HTMLButtonElement>(null)
  const switching = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const scope = () => button.current?.closest<HTMLElement>("[data-theme-scope]") ?? null
  const getSnapshot = useCallback(() => button.current?.closest("[data-theme-scope]")?.classList.contains("dark") ?? false, [])
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [announcement, setAnnouncement] = useState("")

  // The inline script only runs on a full page load; arriving by client navigation (from the home
  // page's « Voir toutes les fonctionnalités », or from another content section, whose frame is another
  // one), apply the preference here, in a layout effect: before the new frame is painted, so it
  // never shows in the light theme for a frame, and before its style is first computed, so its
  // colours don't fade from light to dark either.
  useLayoutEffect(() => {
    button.current?.closest("[data-theme-scope]")?.classList.toggle("dark", preferredDark())
    window.dispatchEvent(new Event(EVENT))
    return () => clearTimeout(switching.current)
  }, [])

  function toggle() {
    const root = scope()
    if (!root) return
    const next = !root.classList.contains("dark")
    // The colours fade only for this switch (motion-safe:data-[theme-switching]:transition-colors
    // on the frame, ContentShell.tsx); a quick second switch keeps the attribute for its own fade.
    clearTimeout(switching.current)
    root.setAttribute("data-theme-switching", "")
    switching.current = setTimeout(() => root.removeAttribute("data-theme-switching"), SWITCH_MS)
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
        ref={button}
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
