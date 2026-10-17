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

/** A piece of a template: literal template text, or the value of a known variable. */
export type VariablePart = { text: string } | { value: string }

/**
 * Cuts `text` into literal template pieces and variable values (keys compared without accent or
 * case; unknown names stay in the literal text as written). The Markdown renderer uses it to
 * insert values as text after parsing the trusted template, so a value is never read as syntax.
 */
export function splitVariables(text: string, vars: Record<string, string>): VariablePart[] {
  const values = new Map(Object.entries(vars).map(([k, v]) => [key(k), v]))
  const parts: VariablePart[] = []
  let literal = ""
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    const k = key(m[1] ?? m[2] ?? "")
    if (!values.has(k)) continue
    literal += text.slice(last, m.index)
    if (literal) parts.push({ text: literal })
    literal = ""
    parts.push({ value: values.get(k) as string })
    last = m.index + m[0].length
  }
  literal += text.slice(last)
  if (literal) parts.push({ text: literal })
  return parts
}

/**
 * Rewrites each known variable as `{key}` (no space, accent or case: `{{ Prénom }}` → `{prenom}`),
 * leaving everything else as written, so a placeholder survives Markdown parsing as one piece
 * (a space would end a link address). Same values once filled.
 */
export function normalizeVariables(text: string, vars: Record<string, string>): string {
  const keys = new Set(Object.keys(vars).map(key))
  return text.replace(TOKEN, (match, double: string | undefined, single: string | undefined, offset: number) => {
    // `\{prénom}`: the organizer escaped the brace to show the placeholder itself.
    if (text[offset - 1] === "\\") return match
    const k = key(double ?? single ?? "")
    return keys.has(k) ? `{${k}}` : match
  })
}

/**
 * Replaces `{prénom}`, `{{prenom}}`… in `text` by the values of `vars` (keys compared without
 * accent or case). Plain text only (the text part of an email): Markdown goes through
 * renderMarkdownWithVariables, which keeps the values out of the Markdown syntax.
 */
export function fillVariables(text: string, vars: Record<string, string>): string {
  return splitVariables(text, vars).map((p) => ("value" in p ? p.value : p.text)).join("")
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
