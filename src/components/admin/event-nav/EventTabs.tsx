"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import type { EventTab } from "@/lib/event-nav"

/**
 * The tabs of an event: page links in a <nav>, not an ARIA tablist (each one loads a page). The
 * current tab is marked by aria-current, a 2 px blue underline and a semibold label (inactive tabs
 * keep a Canvas-coloured border in forced colours, where a transparent one would be repainted).
 * One row at every width: on a phone the row scrolls sideways, the next tab peeking out and a fade
 * on the scrolling edge saying there is more; the current tab is brought into view on load.
 * Focused links scroll in on their own (scroll-padding keeps them clear of the fade).
 */
export default function EventTabs({ tabs }: { tabs: EventTab[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ left: false, right: false })
  const currentHref = tabs.find((t) => t.current)?.href

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const update = () => setMore({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 })
    const active = el.querySelector<HTMLElement>("[aria-current]")
    if (active) {
      // Instant: scrollLeft, never a smooth scroll.
      const { offsetLeft, offsetWidth } = active
      if (offsetLeft < el.scrollLeft || offsetLeft + offsetWidth > el.scrollLeft + el.clientWidth) {
        el.scrollLeft = Math.max(0, offsetLeft - (el.clientWidth - offsetWidth) / 2)
      }
    }
    update()
    el.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      el.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [currentHref, tabs.length])

  return (
    <nav aria-label="Sections de l'événement" className="relative border-b border-gray-200">
      <div ref={scrollerRef} className="relative overflow-x-auto scroll-px-8 [scrollbar-width:thin]">
        <ul role="list" className="flex min-w-max gap-1">
          {tabs.map((t) => (
            <li key={t.id}>
              <Link
                href={t.href}
                aria-current={t.current}
                className={`flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 ${
                  t.current
                    ? "border-blue-600 font-semibold text-blue-700"
                    : "border-transparent text-gray-700 hover:border-gray-300 hover:text-gray-900 forced-colors:border-[Canvas]"
                }`}
              >
                {t.label}
                {/* The main navigation also has a « Paramètres » link (the organisation's): the
                    hidden suffix tells them apart in a screen reader's list of links. */}
                {t.id === "settings" && <span className="sr-only"> de l&apos;événement</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {/* Decorative: says the row goes on. Gone in forced colours, where gradients are not drawn. */}
      {more.left && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-gray-50 to-transparent forced-colors:hidden" />}
      {more.right && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-gray-50 to-transparent forced-colors:hidden" />}
    </nav>
  )
}
