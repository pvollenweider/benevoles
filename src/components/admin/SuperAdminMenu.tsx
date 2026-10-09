"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

// Groups every super-admin nav destination behind one "Super Admin" menu button, instead of
// listing them inline — with 2+ destinations the inline links pushed the nav onto two lines
// (reported directly: a screenshot of the admin nav wrapping). A native disclosure pattern
// (button + role="menu") rather than <details>/<summary> so we control focus movement into the
// first item on open and back to the trigger on close/Escape, matching the rest of this app's
// interactive-menu conventions. Closes like UserMenu (#589, #590): on a pointerdown outside (a tap
// on a tablet fires no mousedown on non-clickable content) and when focus moves out of the menu.
export const SUPER_ADMIN_ITEMS = [
  { href: "/super-admin/organizations", label: "Organisations" },
  { href: "/super-admin/stats", label: "Statistiques" },
  { href: "/super-admin/blocklist", label: "Liste de blocage" },
  { href: "/super-admin/health", label: "Santé du service" },
  { href: "/super-admin/product-updates", label: "Communications admin" },
  { href: "/super-admin/video-feedback", label: "Avis sur les vidéos" },
]

export default function SuperAdminMenu() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const isActive = SUPER_ADMIN_ITEMS.some((i) => pathname.startsWith(i.href))

  useEffect(() => {
    if (!open) return
    const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false)
        buttonRef.current?.focus()
        return
      }
      // role="menu" carries an Up/Down-between-items contract (ARIA APG) — plain Tab order
      // alone isn't enough once we claim that role.
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const list = items()
        if (list.length === 0) return
        e.preventDefault()
        const current = list.indexOf(document.activeElement as HTMLElement)
        const next = e.key === "ArrowDown"
          ? (current + 1) % list.length
          : (current - 1 + list.length) % list.length
        list[next]?.focus()
      }
    }
    function onPointerOutside(e: PointerEvent) {
      if (menuRef.current?.contains(e.target as Node) || buttonRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    // pointerdown covers mouse, touch and pen alike.
    document.addEventListener("pointerdown", onPointerOutside)
    // Move focus to the first item when the menu opens, like any native menu.
    items()[0]?.focus()
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("pointerdown", onPointerOutside)
    }
  }, [open])

  return (
    <div
      className="relative"
      onBlur={(e) => {
        // Focus moved to another element outside the menu (e.g. Tab past the last item): close.
        // A blur without a new target is not that: Safari does not focus a tapped link, so a tap
        // on an item blurs the focused one with relatedTarget null, and closing then would drop
        // the tap. Taps outside are handled by the pointerdown listener.
        const next = e.relatedTarget as Node | null
        if (open && next && !e.currentTarget.contains(next)) setOpen(false)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true) }
        }}
        className={`text-xs whitespace-nowrap px-2 py-0.5 min-h-6 rounded-full font-medium flex items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
          isActive ? "bg-purple-600 text-white" : "bg-purple-100 text-purple-700 hover:bg-purple-200"
        }`}
      >
        Super Admin
        <span aria-hidden="true" className={`motion-safe:transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label="Menu super admin"
          className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50"
        >
          {SUPER_ADMIN_ITEMS.map((item) => {
            const current = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                aria-current={current ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`block px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 focus-visible:bg-gray-100 ${
                  current ? "text-purple-700 font-medium bg-purple-50" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
