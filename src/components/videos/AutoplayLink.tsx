"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import type { ComponentProps, MouseEvent } from "react"
import { markAutoplayIntent } from "@/lib/video-autoplay"

/**
 * A `next/link` to a video's detail page that marks the autoplay intent (#644 owner decision)
 * just before navigating — used by the gallery's cards and the detail page's related videos, the
 * only two paths that may autoplay. A direct visit, a reload or an external link never calls this.
 */
export default function AutoplayLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        markAutoplayIntent()
        onClick?.(event)
      }}
    />
  )
}
