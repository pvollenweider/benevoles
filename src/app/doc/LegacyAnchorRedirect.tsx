"use client"

import { useEffect } from "react"
import { legacyAnchorRedirect } from "@/lib/legacy-anchor-redirect"

/**
 * Keeps the old links into a guide working while it is split into units (#649): when the page is
 * opened, or its fragment changes, on an anchor that isn't on the page any more and that a unit
 * claims, the browser goes to that unit, replacing the history entry (Back doesn't come back to a
 * dead anchor). Renders nothing and never moves the focus: the unit's page loads as any other
 * page would. `targets` is built on the server (legacyAnchorTargets in src/lib/doc-units.ts).
 */
export default function LegacyAnchorRedirect({ targets }: { targets: Record<string, string> }) {
  useEffect(() => {
    const follow = () => {
      const target = legacyAnchorRedirect(window.location.hash, targets, (id) => document.getElementById(id) !== null)
      if (target) window.location.replace(target)
    }
    follow()
    window.addEventListener("hashchange", follow)
    return () => window.removeEventListener("hashchange", follow)
  }, [targets])
  return null
}
