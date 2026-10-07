"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect } from "react"
import { NOT_FOUND_TITLE } from "@/lib/not-found-links"

/**
 * When a page calls notFound() while rendering, the server's <head> has the 404 title, but the
 * metadata hydrated in the browser is the route's own (the root layout's « Bénévoles »): the tab
 * would not say what happened. Sets it again once mounted.
 */
export default function NotFoundTitle() {
  useEffect(() => {
    document.title = NOT_FOUND_TITLE
  }, [])
  return null
}
