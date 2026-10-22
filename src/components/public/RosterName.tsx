// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { ShiftRosterEntry } from "@/lib/shift-roster"
import { rosterLead, rosterSpokenName, rosterSummary, rosterVisibleName } from "@/lib/shift-roster-text"

/**
 * « Aline M. » shown (never wrapped before « M. »), « Aline, initiale M » spoken: French voices
 * read « M. » alone as « Monsieur » (#1068).
 */
export function RosterName({ name }: { name: string }) {
  const spoken = rosterSpokenName(name)
  if (spoken === name) return <>{name}</>
  return (
    <>
      <span aria-hidden="true">{rosterVisibleName(name)}</span>
      <span className="sr-only">{spoken}</span>
    </>
  )
}

/** Ends a sentence once: « … Élodie B. » keeps its initial's period. */
const sentence = (text: string) => (text.endsWith(".") ? text : `${text}.`)

/** A shift's roster in one sentence, printed and spoken forms (rosterSummary), with its lead. */
export function RosterSummary({ entry, own, lead = true }: { entry: ShiftRosterEntry | undefined; own: boolean; lead?: boolean }) {
  const prefix = lead ? `${rosterLead(own)} : ` : ""
  const printed = sentence(`${prefix}${rosterSummary(entry, rosterVisibleName)}`)
  const spoken = sentence(`${prefix}${rosterSummary(entry, rosterSpokenName)}`)
  if (printed === spoken) return <>{printed}</>
  return (
    <>
      <span aria-hidden="true">{printed}</span>
      <span className="sr-only">{spoken}</span>
    </>
  )
}

/** The spoken sentence alone, for a description read with a control (aria-describedby). */
export function rosterSpokenSummary(entry: ShiftRosterEntry | undefined, own: boolean): string {
  return sentence(`${rosterLead(own)} : ${rosterSummary(entry, rosterSpokenName)}`)
}
