"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"
import { clientNavigationTarget, navigationFocusTarget } from "@/lib/content-link-navigation"

/** The pathname the last content frame was shown at, across frames: null until the first one. */
let lastPathname: string | null = null

/**
 * The root of ContentShell, the element the dark theme is scoped to ([data-theme-scope]).
 *
 * A plain link of the page (the rendered Markdown of the guides, the features page, the blog…)
 * to another content page navigates client-side, as the site's next/link links do: no full page
 * load, no repaint of the whole page. The rules are in clientNavigationTarget
 * (src/lib/content-link-navigation.ts); a next/link has already handled its own click (React runs
 * its onClick before this one), a link to the page itself keeps the browser's anchor jump.
 *
 * After a client navigation to another content page, by such a link or a next/link (header, side
 * menu, pager), the focus goes to the #fragment's target, else to <main> (the skip link's target),
 * without scrolling (Next has already scrolled): the next Tab starts from the content, as after a
 * full load, instead of from wherever the removed link was. Not on a full load, nor when only the
 * query changes (the doc index filter).
 */
export default function ContentShellRoot({ pages, className, children }: { pages: readonly string[]; className: string; children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const previous = lastPathname
    lastPathname = pathname
    if (previous === null || previous === pathname) return
    const frame = requestAnimationFrame(() => {
      const id = navigationFocusTarget(window.location.hash, (candidate) => document.getElementById(candidate) !== null, MAIN_CONTENT_ID)
      const target = document.getElementById(id)
      if (!target) return
      if (!target.hasAttribute("tabindex")) {
        target.setAttribute("tabindex", "-1")
        target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true })
      }
      target.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [pathname])

  function onClick(event: React.MouseEvent<HTMLDivElement>) {
    const link = (event.target as Element).closest?.("a[href]")
    if (!(link instanceof HTMLAnchorElement)) return
    const { button, metaKey, ctrlKey, shiftKey, altKey } = event
    // The synthetic event's defaultPrevented is a snapshot taken before a next/link's onClick ran:
    // ask the event itself.
    const defaultPrevented = event.isDefaultPrevented() || event.nativeEvent.defaultPrevented
    const to = clientNavigationTarget(
      { button, metaKey, ctrlKey, shiftKey, altKey, defaultPrevented },
      { href: link.getAttribute("href"), target: link.getAttribute("target"), download: link.hasAttribute("download"), rel: link.getAttribute("rel") },
      window.location.href,
      pages,
    )
    if (!to) return
    event.preventDefault()
    router.push(to)
  }

  return (
    // suppressHydrationWarning: THEME_INIT_SCRIPT (ContentShell.tsx) adds `dark` to this element's
    // class before hydration, on purpose; React would otherwise report the class as a mismatch.
    // The click handler only delegates link activations, which the keyboard triggers too (Enter).
    <div data-theme-scope suppressHydrationWarning className={className} onClick={onClick}>
      {children}
    </div>
  )
}
