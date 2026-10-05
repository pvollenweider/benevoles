// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { telHref } from "@/lib/shift-info"

/**
 * A phone number as a `tel:` link. Its accessible name starts with the visible number (WCAG
 * 2.5.3), then says what it does: « 079 000 00 00, appeler Léa ». May wrap on a narrow screen.
 */
export default function PhoneLink({ name, phone }: { name?: string | null; phone: string }) {
  const who = (name ?? "").trim()
  return (
    <a
      href={telHref(phone)}
      aria-label={`${phone}, appeler${who ? ` ${who}` : ""}`}
      className="text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      {phone}
    </a>
  )
}
