// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { COLOR_OPTIONS, type ColorKey } from "@/lib/roles"

/**
 * Accent colour of an event's public page (#300, part 1): a key from the same curated palette
 * as the role colours, never a free hex value. Every entry pairs a dark background with white
 * text and a light tint for secondary text, all at or above WCAG AA (4.5:1) — the Tailwind
 * classes are written out in full so the compiler keeps them.
 */
export const ACCENT_KEYS = COLOR_OPTIONS.map((o) => o.key) as [ColorKey, ...ColorKey[]]

export type EventAccent = {
  /** Header band: background and default text colour. */
  band: string
  /** Secondary text on the band (organisation name, place). */
  soft: string
  /** Focus outline for controls on the band. */
  focus: string
  /** Small swatch (admin form, lists). */
  swatch: string
  label: string
}

const ACCENTS: Record<ColorKey, Omit<EventAccent, "label" | "swatch">> = {
  blue:    { band: "bg-blue-700 text-white",    soft: "text-blue-100",    focus: "focus-visible:outline-white" },
  amber:   { band: "bg-amber-800 text-white",   soft: "text-amber-100",   focus: "focus-visible:outline-white" },
  pink:    { band: "bg-pink-700 text-white",    soft: "text-pink-100",    focus: "focus-visible:outline-white" },
  violet:  { band: "bg-violet-700 text-white",  soft: "text-violet-100",  focus: "focus-visible:outline-white" },
  red:     { band: "bg-red-700 text-white",     soft: "text-red-100",     focus: "focus-visible:outline-white" },
  orange:  { band: "bg-orange-800 text-white",  soft: "text-orange-100",  focus: "focus-visible:outline-white" },
  stone:   { band: "bg-stone-700 text-white",   soft: "text-stone-200",   focus: "focus-visible:outline-white" },
  teal:    { band: "bg-teal-800 text-white",    soft: "text-teal-100",    focus: "focus-visible:outline-white" },
  indigo:  { band: "bg-indigo-700 text-white",  soft: "text-indigo-100",  focus: "focus-visible:outline-white" },
  cyan:    { band: "bg-cyan-800 text-white",    soft: "text-cyan-100",    focus: "focus-visible:outline-white" },
  lime:    { band: "bg-lime-800 text-white",    soft: "text-lime-100",    focus: "focus-visible:outline-white" },
  rose:    { band: "bg-rose-700 text-white",    soft: "text-rose-100",    focus: "focus-visible:outline-white" },
  fuchsia: { band: "bg-fuchsia-700 text-white", soft: "text-fuchsia-100", focus: "focus-visible:outline-white" },
  sky:     { band: "bg-sky-800 text-white",     soft: "text-sky-100",     focus: "focus-visible:outline-white" },
  emerald: { band: "bg-emerald-800 text-white", soft: "text-emerald-100", focus: "focus-visible:outline-white" },
  yellow:  { band: "bg-yellow-800 text-white",  soft: "text-yellow-100",  focus: "focus-visible:outline-white" },
}

export function isAccentKey(key: unknown): key is ColorKey {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(ACCENTS, key)
}

/** Classes for an event's accent, or null when the event keeps the neutral header. */
export function eventAccent(key: string | null | undefined): EventAccent | null {
  if (!isAccentKey(key)) return null
  const option = COLOR_OPTIONS.find((o) => o.key === key)!
  return { ...ACCENTS[key], swatch: option.swatch, label: option.label }
}
