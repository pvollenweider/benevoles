"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import SuperAdminMenu, { SUPER_ADMIN_ITEMS, superAdminItemLabel } from "./SuperAdminMenu"
import UserMenu from "./UserMenu"
import { SEARCH_MAX_LENGTH } from "@/lib/admin-search"

const LINKS = [
  { href: "/admin/dashboard", match: "/admin/dashboard", label: "Tableau de bord" },
  { href: "/admin/events", match: "/admin/events", label: "Événements" },
  { href: "/admin/members", match: "/admin/members", label: "Membres" },
  { href: "/admin/settings/admins", match: "/admin/settings", label: "Paramètres" },
]

// Below `md` the links don't fit on one row next to the user menu (#361): they move behind a
// "Menu" button that shows them as a list under the bar. A disclosure (aria-expanded + a plain
// list of links), not role="menu": these are navigation links, read and tabbed through as such.
export default function AdminNav({ userName, role, orgName, pendingSpaces = 0 }: { userName: string; role?: string; orgName?: string; pendingSpaces?: number }) {
  const pathname = usePathname()
  const isSuperAdmin = role === "super_admin"
  const [mobileOpen, setMobileOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const searchRef = useRef<HTMLInputElement>(null)
  // The bar shows a search button; the field opens in its place, focused, on click or with the
  // shortcut (#496). Escape closes it and puts focus back on the button.
  const [searchOpen, setSearchOpen] = useState(false)
  const searchToggleRef = useRef<HTMLButtonElement>(null)
  const searchFormRef = useRef<HTMLFormElement>(null)
  const focusSearch = useRef(false)
  const refocusToggle = useRef(false)
  const mobileSearchRef = useRef<HTMLInputElement>(null)
  const focusMobileSearch = useRef(false)

  // The search page has its own field: the bar's would be a second, identical search form.
  const onSearchPage = pathname === "/admin/search"

  // Ctrl+K / ⌘K focuses the search field (#377). A modifier shortcut, not a single character key,
  // so it can't fire while someone types or dictates (WCAG 2.1.4). In the bar it opens the field
  // first (#496). Below `md` the field is in the menu panel: open it, then focus once it's shown.
  // On the search page, its own field.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Password managers and autofill dispatch synthetic keydowns without a key (Sentry: TypeError on /admin/login).
      if ((e.key ?? "").toLowerCase() !== "k" || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      const t = e.target as HTMLElement | null
      // Rich-text editors use Ctrl+K for links.
      if (t?.isContentEditable) return
      // A dialog open over the page keeps the keyboard.
      if (document.querySelector("dialog[open], [aria-modal='true']")) return
      e.preventDefault()
      const pageField = document.getElementById("search-page-q")
      if (pageField) {
        pageField.focus()
      } else if (searchRef.current && searchRef.current.offsetParent !== null) {
        searchRef.current.focus()
      } else if (searchToggleRef.current && searchToggleRef.current.offsetParent !== null) {
        focusSearch.current = true
        setSearchOpen(true)
      } else {
        focusMobileSearch.current = true
        setMobileOpen(true)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  // Focus follows the field: into it when it opens, back on the button when Escape closes it.
  useEffect(() => {
    if (searchOpen && focusSearch.current) {
      focusSearch.current = false
      searchRef.current?.focus()
    } else if (!searchOpen && refocusToggle.current) {
      refocusToggle.current = false
      searchToggleRef.current?.focus()
    }
  }, [searchOpen])

  function openSearch() {
    focusSearch.current = true
    setSearchOpen(true)
  }

  useEffect(() => {
    if (mobileOpen && focusMobileSearch.current) {
      focusMobileSearch.current = false
      mobileSearchRef.current?.focus()
    }
  }, [mobileOpen])

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
  // Active link: color plus an underline, not color alone. Never on two lines (#495): the bar
  // tightens its gaps, then the organization name gives way (truncated), not the labels.
  const linkClass = (active: boolean) =>
    `text-sm whitespace-nowrap ${focusRing} ${active ? "text-blue-600 font-medium underline underline-offset-4 decoration-2" : "text-gray-500 hover:text-gray-800"}`
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
        <div className="flex items-center gap-4 lg:gap-6 min-w-0">
          <Link href="/admin/events" className={`font-semibold text-gray-900 text-sm truncate ${focusRing}`}>
            {orgName ?? "Admin"}
          </Link>
          <div className="hidden md:flex items-center gap-4 lg:gap-6 shrink-0">
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
        <div className="flex items-center gap-3 lg:gap-4 shrink-0">
          <div className="hidden md:flex items-center gap-3 lg:gap-4">
            {!onSearchPage && !searchOpen && (
              // Still a search landmark while closed, so it's found by landmark navigation.
              <div role="search" aria-label="Recherche globale">
              <button
                ref={searchToggleRef}
                type="button"
                onClick={openSearch}
                aria-keyshortcuts="Control+K Meta+K"
                title="Ctrl+K ou ⌘K"
                className="inline-flex items-center justify-center w-8 h-8 text-gray-700 rounded-lg hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <circle cx="8.5" cy="8.5" r="5.5" />
                  <path d="m13 13 4 4" strokeLinecap="round" />
                </svg>
                <span className="sr-only">Rechercher</span>
              </button>
              </div>
            )}
            {!onSearchPage && searchOpen && (
              <form
                ref={searchFormRef}
                role="search"
                aria-label="Recherche globale"
                action="/admin/search"
                className="flex"
                onKeyDown={(e) => {
                  if (e.key !== "Escape") return
                  e.stopPropagation()
                  refocusToggle.current = true
                  setSearchOpen(false)
                }}
                onBlur={(e) => {
                  // Switching window or app blurs too: the field waits for the person to come back.
                  if (!document.hasFocus()) return
                  // Leaving an empty field closes it; a typed query stays until Escape or submit.
                  if (searchFormRef.current?.contains(e.relatedTarget as Node | null)) return
                  if (!searchRef.current?.value) setSearchOpen(false)
                }}
              >
                <label htmlFor="admin-search" className="sr-only">Rechercher un bénévole, un événement ou un poste</label>
                <input
                  ref={searchRef}
                  id="admin-search"
                  type="search"
                  name="q"
                  maxLength={SEARCH_MAX_LENGTH}
                  placeholder="Rechercher"
                  aria-keyshortcuts="Control+K Meta+K"
                  className="w-32 lg:w-48 border border-gray-500 rounded-l-lg px-2.5 py-1.5 text-sm placeholder:text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
                />
                {/* The button labels the field visibly once the placeholder is gone. */}
                <button
                  type="submit"
                  className="px-2.5 border border-l-0 border-gray-500 rounded-r-lg text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <circle cx="8.5" cy="8.5" r="5.5" />
                    <path d="m13 13 4 4" strokeLinecap="round" />
                  </svg>
                  <span className="sr-only">Rechercher</span>
                </button>
              </form>
            )}
            {isSuperAdmin && <SuperAdminMenu pendingSpaces={pendingSpaces} />}
            <Link href="/doc/admin" target="_blank" className="text-xs whitespace-nowrap text-gray-500 hover:text-gray-800 underline underline-offset-2">
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
        {!onSearchPage && <form role="search" aria-label="Recherche globale" action="/admin/search" className="flex gap-2 px-4 py-2">
          <label htmlFor="admin-search-mobile" className="sr-only">Rechercher un bénévole, un événement ou un poste</label>
          <input
            ref={mobileSearchRef}
            id="admin-search-mobile"
            type="search"
            name="q"
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Rechercher"
            className="flex-1 min-w-0 min-h-11 border border-gray-500 rounded-lg px-3 text-sm placeholder:text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
          />
          <button
            type="submit"
            className="min-h-11 px-3 text-sm font-medium text-blue-700 border border-gray-500 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Rechercher
          </button>
        </form>}
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
                  {superAdminItemLabel(item, pendingSpaces)} <span className="ml-1.5 text-xs text-purple-700">Super admin</span>
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
