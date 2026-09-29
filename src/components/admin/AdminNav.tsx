"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import SuperAdminMenu, { SUPER_ADMIN_ITEMS } from "./SuperAdminMenu"
import UserMenu from "./UserMenu"

const LINKS = [
  { href: "/admin/dashboard", match: "/admin/dashboard", label: "Tableau de bord" },
  { href: "/admin/events", match: "/admin/events", label: "Événements" },
  { href: "/admin/members", match: "/admin/members", label: "Membres" },
  { href: "/admin/settings/admins", match: "/admin/settings", label: "Paramètres" },
]

// Below `md` the links don't fit on one row next to the user menu (#361): they move behind a
// "Menu" button that shows them as a list under the bar. A disclosure (aria-expanded + a plain
// list of links), not role="menu": these are navigation links, read and tabbed through as such.
export default function AdminNav({ userName, role, orgName }: { userName: string; role?: string; orgName?: string }) {
  const pathname = usePathname()
  const isSuperAdmin = role === "super_admin"
  const [mobileOpen, setMobileOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!mobileOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      setMobileOpen(false)
      // Only take focus back when it was in the panel or on the toggle: an Escape meant for
      // something else (the user menu, a dialog) mustn't pull focus here.
      const active = document.activeElement
      if (active === toggleRef.current || panelRef.current?.contains(active)) toggleRef.current?.focus()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [mobileOpen])

  const focusRing = "rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
  // Active link: color plus an underline, not color alone.
  const linkClass = (active: boolean) =>
    `text-sm ${focusRing} ${active ? "text-blue-600 font-medium underline underline-offset-4 decoration-2" : "text-gray-500 hover:text-gray-800"}`
  const mobileLinkClass = (active: boolean) =>
    `flex items-center min-h-11 px-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 ${active ? "text-blue-700 font-medium bg-blue-50" : "text-gray-700 hover:bg-gray-50"}`
  // Following a link closes the panel. For the current page nothing navigates, so focus would be
  // left on a hidden link: put it back on the toggle.
  const onPanelLink = (active: boolean) => () => {
    setMobileOpen(false)
    if (active) toggleRef.current?.focus()
  }

  return (
    <nav aria-label="Navigation de l'administration" className="bg-white border-b border-gray-200 px-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 h-14">
        <div className="flex items-center gap-6 min-w-0">
          <Link href="/admin/events" className={`font-semibold text-gray-900 text-sm truncate ${focusRing}`}>
            {orgName ?? "Admin"}
          </Link>
          <div className="hidden md:flex items-center gap-6">
            {LINKS.map((l) => {
              const active = pathname.startsWith(l.match)
              return (
                <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
                  {l.label}
                </Link>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden md:flex items-center gap-4">
            {isSuperAdmin && <SuperAdminMenu />}
            <Link href="/doc/admin" target="_blank" className="text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2">
              Aide
              <span className="sr-only"> (ouvre dans un nouvel onglet)</span>
            </Link>
          </div>
          <UserMenu userName={userName} isSuperAdmin={isSuperAdmin} />
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={mobileOpen}
            aria-controls={panelId}
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden inline-flex items-center gap-1.5 min-h-11 px-2 text-sm text-gray-700 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <span aria-hidden="true">{mobileOpen ? "✕" : "☰"}</span>
            Menu
          </button>
        </div>
      </div>

      <div ref={panelRef} id={panelId} hidden={!mobileOpen} className="md:hidden border-t border-gray-100 -mx-4 py-1">
        <ul>
          {LINKS.map((l) => {
            const active = pathname.startsWith(l.match)
            return (
              <li key={l.href}>
                <Link href={l.href} aria-current={active ? "page" : undefined} onClick={onPanelLink(active)} className={mobileLinkClass(active)}>
                  {l.label}
                </Link>
              </li>
            )
          })}
          {isSuperAdmin && SUPER_ADMIN_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={active ? "page" : undefined} onClick={onPanelLink(active)} className={mobileLinkClass(active)}>
                  {item.label} <span className="ml-1.5 text-xs text-purple-700">Super admin</span>
                </Link>
              </li>
            )
          })}
          <li>
            <Link href="/doc/admin" target="_blank" onClick={onPanelLink(false)} className={mobileLinkClass(false)}>
              Aide
              <span className="sr-only"> (ouvre dans un nouvel onglet)</span>
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  )
}
