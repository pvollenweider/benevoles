"use client"

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

// Groups every super-admin nav destination behind one "Super Admin" menu button, instead of
// listing them inline — with 2+ destinations the inline links pushed the nav onto two lines
// (reported directly: a screenshot of the admin nav wrapping). A native disclosure pattern
// (button + role="menu") rather than <details>/<summary> so we control focus movement into the
// first item on open and back to the trigger on close/Escape, matching the rest of this app's
// interactive-menu conventions.
const ITEMS = [
  { href: "/super-admin/organizations", label: "Organisations" },
  { href: "/super-admin/product-updates", label: "Communications admin" },
]

export default function SuperAdminMenu() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const isActive = ITEMS.some((i) => pathname.startsWith(i.href))

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false)
        buttonRef.current?.focus()
        return
      }
      // role="menu" carries an Up/Down-between-items contract (ARIA APG) — plain Tab order
      // alone isn't enough once we claim that role.
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])
        if (items.length === 0) return
        e.preventDefault()
        const currentIndex = items.indexOf(document.activeElement as HTMLAnchorElement)
        const nextIndex = e.key === "ArrowDown"
          ? (currentIndex + 1) % items.length
          : (currentIndex - 1 + items.length) % items.length
        items[nextIndex]?.focus()
      }
    }
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node) || buttonRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("mousedown", onClickOutside)
    // Move focus to the first item when the menu opens, like any native menu.
    const first = menuRef.current?.querySelector<HTMLAnchorElement>("a")
    first?.focus()
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("mousedown", onClickOutside)
    }
  }, [open])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true) }
        }}
        className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
          isActive ? "bg-purple-600 text-white" : "bg-purple-100 text-purple-700 hover:bg-purple-200"
        }`}
      >
        Super Admin
        <span aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label="Menu super admin"
          className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50"
        >
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`block px-3 py-2 text-sm ${
                pathname.startsWith(item.href)
                  ? "text-purple-700 font-medium bg-purple-50"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
