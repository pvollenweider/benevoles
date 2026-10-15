"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, type ReactNode } from "react"

/**
 * An <h2> reached by a link to its anchor (« Supprimer définitivement… » of the « ⋯ » menu): a
 * client navigation scrolls to the anchor without moving the focus, so the heading takes it when
 * the page opens on its hash. Focused by code only (tabIndex -1, DESIGN.md exception).
 */
export default function FocusTargetHeading({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  useEffect(() => {
    if (window.location.hash === `#${id}`) document.getElementById(id)?.focus()
  }, [id])
  return <h2 id={id} tabIndex={-1} className={`${className ?? ""} scroll-mt-4 focus:outline-none`}>{children}</h2>
}
