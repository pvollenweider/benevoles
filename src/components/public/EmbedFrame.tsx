"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef } from "react"
import { EMBED_ROOT_ATTRIBUTE, EMBED_VIEW_HEIGHT_VAR, EMBED_VIEW_TOP_VAR, embedHeightMessage, updateEmbedBand } from "@/lib/embed"

/** Steps of the visible share at which the visible band is measured again (every 0.5 %). */
const THRESHOLDS = Array.from({ length: 201 }, (_, i) => i / 200)

/**
 * The content of the embeddable sign-up (#948), measured, inside another site's frame:
 *
 * - its height goes to that site each time it changes (the snippet's optional listener resizes
 *   the iframe). The wrapper has no minimum height, unlike the page: the document of a frame is at
 *   least as tall as the frame, so measuring it would never let the frame shrink back.
 *   Only a number is posted, with the target origin "*": the page doesn't know the association's
 *   address, and nothing in a height can leak.
 * - the part of the frame the visitor sees is kept in two CSS variables, so that a dialog
 *   (ModalShell: the charter, a withdrawal) opens there. A resized frame is as tall as its
 *   content: a dialog centred in it could open far below the visitor's screen.
 *
 * Outside a frame (the page opened on its own), nothing of this runs.
 */
export default function EmbedFrame({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || window.parent === window) return
    const cleanups: (() => void)[] = []

    if (typeof ResizeObserver !== "undefined") {
      let last = 0
      const post = () => {
        const message = embedHeightMessage(el.getBoundingClientRect().height)
        if (message.height === last) return
        last = message.height
        try {
          window.parent.postMessage(message, "*")
        } catch {
          // A parent that can't receive messages: the snippet's fixed height applies.
        }
      }
      const resize = new ResizeObserver(post)
      resize.observe(el)
      post()
      cleanups.push(() => resize.disconnect())
    }

    if (typeof IntersectionObserver !== "undefined") {
      // In a frame, the implicit root is the top-level viewport, cross-origin too: the
      // intersection is the band of the frame on the visitor's screen, in the frame's coordinates.
      const root = document.documentElement
      // A dialog measures again when it opens (measureEmbedBand): scrolling the site can move the
      // band without changing its share, which this observer would not hear of.
      const visible = new IntersectionObserver(([entry]) => updateEmbedBand(entry.intersectionRect), { threshold: THRESHOLDS })
      visible.observe(el)
      cleanups.push(() => {
        visible.disconnect()
        root.style.removeProperty(EMBED_VIEW_TOP_VAR)
        root.style.removeProperty(EMBED_VIEW_HEIGHT_VAR)
      })
    }

    return () => cleanups.forEach((fn) => fn())
  }, [])

  // flow-root: the children's margins stay inside the measured box.
  return <div ref={ref} {...{ [EMBED_ROOT_ATTRIBUTE]: "" }} className="flow-root bg-gray-50">{children}</div>
}
