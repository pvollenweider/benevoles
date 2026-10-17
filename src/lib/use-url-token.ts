"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { stripTokenFromAddressBar } from "@/lib/url-token"

/**
 * The `token` of an emailed link, read once into state, then removed from the address bar (#1042).
 * Read and removed in the same component, so the form keeps the token it was rendered with.
 */
export function useUrlToken(): string {
  const searchParams = useSearchParams()
  const [token] = useState(() => searchParams.get("token") ?? "")
  useEffect(() => {
    stripTokenFromAddressBar(window)
  }, [])
  return token
}
