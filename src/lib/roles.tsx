// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { posteCategory } from "./poste-categories"

/**
 * Examples offered in the poste field (#1018), in rough frequency order. They are real postes
 * from organisations, at least one per family of `poste-categories.ts`; the family gives their
 * default colour even when they are not in this list.
 */
export const KNOWN_ROLES = [
  "Buvette",
  "Accueil",
  "Caisse",
  "Billetterie",
  "Bar",
  "Montage",
  "Démontage & rangement",
  "Installation",
  "Rangement",
  "Cuisine",
  "Sécurité",
  "Premiers secours",
  "Parking",
  "Ravitaillement",
  "Signaleurs",
  "Animation enfants",
  "Maquillage",
  "Plonge",
  "Stand",
  "Transport",
  "Photos",
]

// ── Curated color picker (#219) ───────────────────────────────────────────────
// Every option here reuses a bar/accent pair already defined below — all already checked for
// WCAG AA contrast with white bar text — instead of accepting an arbitrary hex color, which
// would need its own contrast check and a rewrite of every bar from Tailwind utility classes to
// inline styles. An admin's explicit choice (Shift.colorKey, shared per role like displayOrder)
// always wins over both the poste family and the hash fallback below.
export type ColorKey =
  | "blue" | "amber" | "pink" | "violet" | "red" | "orange" | "stone" | "teal"
  | "indigo" | "cyan" | "lime" | "rose" | "fuchsia" | "sky" | "emerald" | "yellow"

export const COLOR_OPTIONS: { key: ColorKey; label: string; swatch: string }[] = [
  { key: "blue",     label: "Bleu",         swatch: "bg-blue-600" },
  { key: "amber",    label: "Ambre",        swatch: "bg-amber-700" },
  { key: "pink",     label: "Rose",         swatch: "bg-pink-600" },
  { key: "violet",   label: "Violet",       swatch: "bg-violet-600" },
  { key: "red",      label: "Rouge",        swatch: "bg-red-600" },
  { key: "orange",   label: "Orange",       swatch: "bg-orange-700" },
  { key: "stone",    label: "Gris",         swatch: "bg-stone-600" },
  { key: "teal",     label: "Sarcelle",     swatch: "bg-teal-700" },
  { key: "indigo",   label: "Indigo",       swatch: "bg-indigo-600" },
  { key: "cyan",     label: "Cyan",         swatch: "bg-cyan-700" },
  { key: "lime",     label: "Citron vert",  swatch: "bg-lime-700" },
  { key: "rose",     label: "Corail",       swatch: "bg-rose-600" },
  { key: "fuchsia",  label: "Fuchsia",      swatch: "bg-fuchsia-600" },
  { key: "sky",      label: "Ciel",         swatch: "bg-sky-600" },
  { key: "emerald",  label: "Émeraude",     swatch: "bg-emerald-700" },
  { key: "yellow",   label: "Jaune",        swatch: "bg-yellow-700" },
]

// ── Timeline bar classes — solid dark fills, white text ──────────────────────
// Unavailable bars: very light, no text (state is visually obvious)
// All dark shades pass WCAG AA (≥ 4.5:1) with white text. Keep every class written in full:
// Tailwind cannot see classes built by concatenation.

type BarState = "default" | "selected" | "unavailable"

const PALETTE_BAR: Record<ColorKey, Record<BarState, string>> = {
  blue: {
    default:     "bg-blue-600 hover:bg-blue-700",
    selected:    "bg-blue-700 ring-2 ring-offset-1 ring-blue-400",
    unavailable: "bg-blue-100",
  },
  amber: {
    default:     "bg-amber-700 hover:bg-amber-800",
    selected:    "bg-amber-800 ring-2 ring-offset-1 ring-amber-400",
    unavailable: "bg-amber-100",
  },
  pink: {
    default:     "bg-pink-600 hover:bg-pink-700",
    selected:    "bg-pink-700 ring-2 ring-offset-1 ring-pink-400",
    unavailable: "bg-pink-100",
  },
  violet: {
    default:     "bg-violet-600 hover:bg-violet-700",
    selected:    "bg-violet-700 ring-2 ring-offset-1 ring-violet-400",
    unavailable: "bg-violet-100",
  },
  red: {
    default:     "bg-red-600 hover:bg-red-700",
    selected:    "bg-red-700 ring-2 ring-offset-1 ring-red-400",
    unavailable: "bg-red-100",
  },
  orange: {
    default:     "bg-orange-700 hover:bg-orange-800",
    selected:    "bg-orange-800 ring-2 ring-offset-1 ring-orange-400",
    unavailable: "bg-orange-100",
  },
  stone: {
    default:     "bg-stone-600 hover:bg-stone-700",
    selected:    "bg-stone-700 ring-2 ring-offset-1 ring-stone-400",
    unavailable: "bg-stone-100",
  },
  teal: {
    default:     "bg-teal-700 hover:bg-teal-800",
    selected:    "bg-teal-800 ring-2 ring-offset-1 ring-teal-400",
    unavailable: "bg-teal-100",
  },
  indigo: {
    default:     "bg-indigo-600 hover:bg-indigo-700",
    selected:    "bg-indigo-700 ring-2 ring-offset-1 ring-indigo-400",
    unavailable: "bg-indigo-100",
  },
  cyan: {
    default:     "bg-cyan-700 hover:bg-cyan-800",
    selected:    "bg-cyan-800 ring-2 ring-offset-1 ring-cyan-400",
    unavailable: "bg-cyan-100",
  },
  lime: {
    default:     "bg-lime-700 hover:bg-lime-800",
    selected:    "bg-lime-800 ring-2 ring-offset-1 ring-lime-400",
    unavailable: "bg-lime-100",
  },
  rose: {
    default:     "bg-rose-600 hover:bg-rose-700",
    selected:    "bg-rose-700 ring-2 ring-offset-1 ring-rose-400",
    unavailable: "bg-rose-100",
  },
  fuchsia: {
    default:     "bg-fuchsia-600 hover:bg-fuchsia-700",
    selected:    "bg-fuchsia-700 ring-2 ring-offset-1 ring-fuchsia-400",
    unavailable: "bg-fuchsia-100",
  },
  sky: {
    default:     "bg-sky-600 hover:bg-sky-700",
    selected:    "bg-sky-700 ring-2 ring-offset-1 ring-sky-400",
    unavailable: "bg-sky-100",
  },
  emerald: {
    default:     "bg-emerald-700 hover:bg-emerald-800",
    selected:    "bg-emerald-800 ring-2 ring-offset-1 ring-emerald-400",
    unavailable: "bg-emerald-100",
  },
  yellow: {
    default:     "bg-yellow-700 hover:bg-yellow-800",
    selected:    "bg-yellow-800 ring-2 ring-offset-1 ring-yellow-400",
    unavailable: "bg-yellow-100",
  },
}

const PALETTE_ACCENT: Record<ColorKey, string> = {
  blue: "bg-blue-400", amber: "bg-amber-400", pink: "bg-pink-400", violet: "bg-violet-400",
  red: "bg-red-400", orange: "bg-orange-400", stone: "bg-stone-400", teal: "bg-teal-400",
  indigo: "bg-indigo-400", cyan: "bg-cyan-500", lime: "bg-lime-500", rose: "bg-rose-400",
  fuchsia: "bg-fuchsia-400", sky: "bg-sky-400", emerald: "bg-emerald-500", yellow: "bg-yellow-500",
}

// A poste with no family gets one of these four colours only: every other palette colour names
// a family, and picking one here would make an unknown poste look like a known family (red for
// Secours, for example).
const HASH_COLOR_KEYS = ["indigo", "lime", "sky", "fuchsia"] as const satisfies readonly ColorKey[]

function isColorKey(key: string): key is ColorKey {
  return Object.prototype.hasOwnProperty.call(PALETTE_BAR, key)
}

function hashRole(name: string): ColorKey {
  const lower = name.toLowerCase()
  let h = 0
  for (let i = 0; i < lower.length; i++) h = (h * 31 + lower.charCodeAt(i)) >>> 0
  return HASH_COLOR_KEYS[h % HASH_COLOR_KEYS.length]
}

/** The default colour key of a poste: the organiser's choice, then its family, then the hash. */
function colorKeyOf(roleName: string, colorKey?: string | null): ColorKey {
  if (colorKey && isColorKey(colorKey)) return colorKey
  return posteCategory(roleName)?.colorKey ?? hashRole(roleName)
}

export function getRoleAccent(roleName: string, colorKey?: string | null): string {
  return PALETTE_ACCENT[colorKeyOf(roleName, colorKey)]
}

export function getBarClasses(roleName: string, state: BarState, colorKey?: string | null): string {
  return PALETTE_BAR[colorKeyOf(roleName, colorKey)][state]
}

const cls = "w-3.5 h-3.5 text-gray-500 flex-shrink-0"
const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: cls,
  "aria-hidden": "true" as const,
}

/** One icon per poste family; decorative next to the poste name, so hidden from screen readers. */
export function RoleIcon({ roleName }: { roleName: string }) {
  const category = posteCategory(roleName)
  if (!category) return null

  switch (category.key) {
    case "accueil":
      return (
        <svg {...svgProps}>
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      )
    case "boissons":
      return (
        <svg {...svgProps}>
          <path d="M18 8h1a4 4 0 010 8h-1" />
          <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />
          <line x1="6" y1="1" x2="6" y2="4" />
          <line x1="10" y1="1" x2="10" y2="4" />
          <line x1="14" y1="1" x2="14" y2="4" />
        </svg>
      )
    case "restauration":
      return (
        <svg {...svgProps}>
          <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2" />
          <path d="M7 2v20" />
          <path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3z" />
        </svg>
      )
    case "installation":
      return (
        <svg {...svgProps}>
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
      )
    case "demontage":
      return (
        <svg {...svgProps}>
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      )
    case "securite":
      return (
        <svg {...svgProps}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      )
    case "secours":
      return (
        <svg {...svgProps}>
          <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />
        </svg>
      )
    case "course":
      return (
        <svg {...svgProps}>
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      )
    case "animation":
      return (
        <svg {...svgProps}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      )
    case "vente":
      return (
        <svg {...svgProps}>
          <path d="M6 2l-2 4v14a2 2 0 002 2h12a2 2 0 002-2V6l-2-4z" />
          <line x1="4" y1="6" x2="20" y2="6" />
          <path d="M16 10a4 4 0 01-8 0" />
        </svg>
      )
    case "logistique":
      return (
        <svg {...svgProps}>
          <rect x="1" y="3" width="15" height="13" rx="2" ry="2" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      )
    case "image":
      return (
        <svg {...svgProps}>
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      )
  }
  return null
}
