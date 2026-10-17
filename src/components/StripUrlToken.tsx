"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect } from "react"
import { stripTokenFromAddressBar } from "@/lib/url-token"

/**
 * For a server page that has already read the `token` of its emailed link (and handed it to its
 * form as a prop): removes it from the address bar once the page is interactive (#1042).
 */
export default function StripUrlToken() {
  useEffect(() => {
    stripTokenFromAddressBar(window)
  }, [])
  return null
}
