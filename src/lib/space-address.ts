// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Domain an organisation's address is a subdomain of (« benevol.app » for « cdp.benevol.app »),
 * shown in Paramètres as « Adresse de votre espace ». It comes from the instance's configured
 * address (NEXT_PUBLIC_APP_URL, without « www. »), so a proxy or a local capture stack shows the
 * real domain and not its own host. Without a usable configured address (unset, localhost, an IP),
 * it falls back to the request host: its parent domain when it is a subdomain, the host itself otherwise (an IP address included).
 */
export function spaceBaseDomain(appUrl: string | undefined, host: string | null | undefined, fallback: string): string {
  try {
    const configured = new URL(appUrl ?? "").hostname.replace(/^www\./, "")
    if (configured && configured !== "localhost" && !/^\d+(\.\d+){3}$/.test(configured)) return configured
  } catch {
    // No configured address: development or tests.
  }
  const requestHost = host?.trim() || fallback
  if (/^\d+(\.\d+){3}(:\d+)?$/.test(requestHost)) return requestHost
  const parts = requestHost.split(".")
  return parts.length >= 3 ? parts.slice(1).join(".") : requestHost
}
