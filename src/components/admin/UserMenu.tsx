"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"

// The signed-in user's menu in the top bar: their account page and sign-out, behind their name
// instead of a loose name + "Déconnexion" pair. Same disclosure pattern as SuperAdminMenu
// (button + role="menu", focus into the first item on open, back to the trigger on Escape,
// Up/Down between items), plus closing when focus leaves the menu (Tab past the last item).
export default function UserMenu({ userName, isSuperAdmin }: { userName: string; isSuperAdmin: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  // Super admins already have their own profile page (email + password); org admins get theirs.
  const accountHref = isSuperAdmin ? "/super-admin/profile" : "/admin/account"
  const onAccountPage = pathname.startsWith(accountHref)

  useEffect(() => {
    if (!open) return
    const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false)
        buttonRef.current?.focus()
        return
      }
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
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node) || buttonRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("mousedown", onClickOutside)
    items()[0]?.focus()
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("mousedown", onClickOutside)
    }
  }, [open])

  return (
    <div
      className="relative"
      onBlur={(e) => {
        // Focus moved outside the trigger and the menu (e.g. Tab past the last item): close.
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
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
        className="text-xs text-gray-700 hover:text-gray-900 flex items-center gap-1 rounded px-1.5 py-1 min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        {/* Truncated on narrow screens (#361); the accessible name keeps the full text. */}
        <span className="truncate max-w-32 sm:max-w-none">{userName}</span>
        <span aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label="Menu du compte"
          className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50"
        >
          <Link
            href={accountHref}
            role="menuitem"
            aria-current={onAccountPage ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={`block px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 focus-visible:bg-gray-100 ${
              onAccountPage ? "text-blue-700 font-medium bg-blue-50" : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            Mon compte
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 focus-visible:bg-gray-100"
          >
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}
