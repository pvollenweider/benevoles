"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { WITHDRAWAL_MESSAGE_LABEL, WITHDRAWAL_MESSAGE_MAX, withdrawalMessageHint } from "@/lib/volunteer-withdraw"

type Props = {
  id: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/**
 * The optional « Un mot pour l'organisation ? » left with a withdrawal (#559), shared by the
 * public event page's dialog and the personal page's inline confirmation. The remaining-character
 * count sits in the same hint as the sensitive-data warning, both reached through one
 * aria-describedby, and is not a live region (follows TargetedMessageForm's pattern): read if the
 * screen reader visits the field, never announced on every keystroke.
 */
export default function WithdrawMessageField({ id, value, onChange, disabled }: Props) {
  const hintId = `${id}-hint`
  return (
    <div className="mt-3">
      <label htmlFor={id} className="block text-xs font-medium text-gray-700 mb-1">
        {WITHDRAWAL_MESSAGE_LABEL}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={WITHDRAWAL_MESSAGE_MAX}
        rows={2}
        disabled={disabled}
        aria-describedby={hintId}
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
      />
      <p id={hintId} className="text-xs text-gray-600 mt-1">
        {withdrawalMessageHint(value.length)}
      </p>
    </div>
  )
}
