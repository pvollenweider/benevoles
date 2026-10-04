// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Variables of the event's own messages (confirmation message shown after sign-up, on the
 * personal page and in the confirmation email). The message templates of « Écrire aux
 * bénévoles » (#482) write variables `{prénom}`, and these messages used to only understand
 * `{{prenom}}`: an organizer moving from one to the other, or the demo seed, got the variable
 * printed as is. Both spellings are accepted here, single or double braces, with or without the
 * accent, any case. Unknown names are left as written. Pure, shared by client and server code.
 */
import { clockTime } from "./gantt-utils"

const TOKEN = /\{\{\s*([^{}\n]{1,30}?)\s*\}\}|\{\s*([^{}\n]{1,30}?)\s*\}/g

/** « Prénom » → « prenom »: the comparison key of a variable name. */
function key(name: string): string {
  return name.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/** Replaces `{prénom}`, `{{prenom}}`… in `text` by the values of `vars` (keys compared without accent or case). */
export function fillVariables(text: string, vars: Record<string, string>): string {
  const values = new Map(Object.entries(vars).map(([k, v]) => [key(k), v]))
  return text.replace(TOKEN, (match, double: string | undefined, single: string | undefined) => {
    const k = key(double ?? single ?? "")
    return values.has(k) ? (values.get(k) as string) : match
  })
}

/**
 * Values of the confirmation message variables for a volunteer and their first shift: the shift's
 * label, its day as already formatted by the caller, and its start time as « 08:00 ».
 */
export function confirmationVariables(firstName: string, shift?: { label: string; day?: string; startTime?: string }): Record<string, string> {
  return {
    prénom: firstName,
    créneau: shift?.label ?? "",
    date: shift?.day ?? "",
    heure: shift?.startTime ? clockTime(shift.startTime) : "",
  }
}
