"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { PASSWORD_RULES } from "@/lib/password"

/**
 * Password requirements, shown before typing (neutral) then ticked as they're met, so they can be
 * read up front and linked to the field with aria-describedby. The ✓/✗ glyphs are decorative;
 * each rule's state is spelled out for screen readers.
 */
export default function PasswordRules({ password, id }: { password: string; id?: string }) {
  return (
    <ul id={id} className="space-y-1 mt-2">
      {PASSWORD_RULES.map((rule) => {
        const state = !password ? "pending" : rule.test(password) ? "ok" : "ko"
        const color = state === "ok" ? "text-green-800" : state === "ko" ? "text-red-700" : "text-gray-600"
        return (
          <li key={rule.id} className={`flex items-center gap-1.5 text-xs ${color}`}>
            <span aria-hidden="true">{state === "ok" ? "✓" : state === "ko" ? "✗" : "•"}</span>
            <span>{rule.label}</span>
            {state !== "pending" && <span className="sr-only">{state === "ok" ? " : respectée" : " : non respectée"}</span>}
          </li>
        )
      })}
    </ul>
  )
}
