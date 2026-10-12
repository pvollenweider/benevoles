"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { AUDIENCE_INDEX_PATH, CONTENT_NAV, type AudienceNavLink } from "@/lib/doc-pages"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"

/**
 * A link of the bar: the current page, or its section (a blog post under /blog, #944), marked in
 * words (aria-current) and weight, not colour only.
 */
const barLink = `text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors py-3 flex items-center rounded ${focusRing} data-current:font-semibold data-current:text-gray-900 dark:data-current:text-gray-100 data-current:underline data-current:underline-offset-4`

const noSubscription = () => () => {}

/**
 * True once the component runs in the browser (after hydration), false in the server's HTML: the
 * « Pour qui ? » entry is a plain link to its index until then, so it works without JavaScript.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false)
}

/**
 * « Pour qui ? » (#872): a disclosure, not a menu (no role="menu", no arrow-key model): a button
 * with aria-expanded that shows or hides the list of the audience pages and their index right
 * after it in the reading order. Escape closes it and gives the focus back to the button; a click
 * outside or the focus leaving it closes it too. Below `lg` the list opens under the whole header,
 * across the site container, so it never leaves a 320 px screen; from `lg` it hangs under the
 * button, aligned on its right edge. Without JavaScript (or before hydration) the entry is a link
 * to the index page, which lists the same pages.
 */
function AudienceDisclosure({ links }: { links: readonly AudienceNavLink[] }) {
  const pathname = usePathname()
  const hydrated = useHydrated()
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const current = links.some((l) => l.path === pathname)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  // Before hydration, a plain link. Focus on it during the (very short) swap to the button is lost
  // to the page: accepted, the link and the button sit at the same place.
  if (!hydrated) {
    return (
      <Link href={AUDIENCE_INDEX_PATH} aria-current={pathname === AUDIENCE_INDEX_PATH ? "page" : undefined} data-current={pathname === AUDIENCE_INDEX_PATH ? "" : undefined} className={barLink}>
        Pour qui ?
      </Link>
    )
  }

  return (
    <div
      ref={wrapper}
      className="lg:relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault()
          setOpen(false)
          button.current?.focus()
        }
      }}
      onBlur={(e) => {
        // Closed when the focus moves to another element (Tab past the last link), not when it moves
        // inside, nor when it goes nowhere: Safari gives no focus to a clicked link, so a null
        // relatedTarget may be a click on a link of the list (a click outside is handled above).
        if (open && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false)
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={`text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors py-3 inline-flex items-center gap-1 rounded ${focusRing} ${current ? "font-semibold text-gray-900 dark:text-gray-100 underline underline-offset-4" : ""}`}
      >
        Pour qui ?
        {/* The bold, underlined state said in words: the current page is one of the list's. */}
        {current && <span className="sr-only">, rubrique actuelle</span>}
        <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 fill-current ${open ? "rotate-180" : ""}`}>
          <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
      </button>
      <ul
        id={listId}
        hidden={!open}
        className="absolute top-full inset-x-6 lg:inset-x-auto lg:right-0 lg:w-80 mt-1 z-30 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 shadow-lg"
      >
        {links.map((l) => (
          <li key={l.path}>
            <Link
              href={l.path}
              aria-current={pathname === l.path ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={`flex min-h-11 items-center rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 ${focusRing} aria-[current=page]:font-semibold aria-[current=page]:text-gray-900 dark:aria-[current=page]:text-gray-100 aria-[current=page]:underline aria-[current=page]:underline-offset-4 ${l.path === AUDIENCE_INDEX_PATH ? "mt-1 border-t border-gray-200 dark:border-gray-700 rounded-t-none pt-3" : ""}`}
            >
              {l.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The content navigation: features, « Pour qui ? » (the audience pages, on the hosted service
 * only: `audiences` is empty elsewhere, src/lib/doc-pages.ts `audienceNav`), the guides, the blog.
 * The parent header must be `relative`: below `lg` the « Pour qui ? » list opens under it.
 */
export default function ContentNav({ audiences = [] }: { audiences?: readonly AudienceNavLink[] }) {
  const pathname = usePathname()
  const [features, ...guides] = CONTENT_NAV
  const link = (g: (typeof CONTENT_NAV)[number]) => {
    // The page itself is « page »; a page below it (a blog post under /blog, #944) is in its
    // section, « true »: marked the same way, in words for screen readers and in weight.
    const current = pathname === g.path ? "page" : pathname.startsWith(`${g.path}/`) ? "true" : undefined
    return (
      <Link key={g.path} href={g.path} aria-current={current} data-current={current ? "" : undefined} className={barLink}>
        {g.title}
      </Link>
    )
  }
  return (
    <nav aria-label="Présentation, guides et blog" className="flex flex-wrap gap-x-4 -my-3 text-sm">
      {link(features)}
      {audiences.length > 0 && <AudienceDisclosure links={audiences} />}
      {guides.map(link)}
    </nav>
  )
}
