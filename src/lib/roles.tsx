export const KNOWN_ROLES = [
  "Billetterie",
  "Buvette",
  "Loge",
  "Photos",
  "Vidéo",
  "Montage & rangement",
  "Démontage & rangement",
  "Préparation",
]

// Light accent for admin left-border decoration
const ROLE_ACCENTS: [string, string][] = [
  ["démontage",   "bg-stone-400"],
  ["demontage",   "bg-stone-400"],
  ["montage",     "bg-orange-400"],
  ["billetterie", "bg-blue-400"],
  ["buvette",     "bg-amber-400"],
  ["loge",        "bg-pink-400"],
  ["photo",       "bg-violet-400"],
  ["vid",         "bg-red-400"],
  ["préparation", "bg-teal-400"],
  ["preparation", "bg-teal-400"],
]

const ACCENT_FALLBACK = [
  "bg-indigo-400", "bg-cyan-500", "bg-lime-500", "bg-rose-400",
  "bg-fuchsia-400", "bg-sky-400", "bg-emerald-500", "bg-yellow-500",
]

export function getRoleAccent(roleName: string): string {
  const lower = roleName.toLowerCase()
  for (const [key, color] of ROLE_ACCENTS) {
    if (lower.includes(key)) return color
  }
  let h = 0
  for (let i = 0; i < lower.length; i++) h = (h * 31 + lower.charCodeAt(i)) >>> 0
  return ACCENT_FALLBACK[h % ACCENT_FALLBACK.length]
}

// ── Timeline bar classes — solid dark fills, white text ──────────────────────
// Unavailable bars: very light, no text (state is visually obvious)
// All dark shades pass WCAG AA (≥ 4.5:1) with white text.

type BarState = "default" | "selected" | "unavailable"

const BAR: Record<string, Record<BarState, string>> = {
  billetterie: {
    default:     "bg-blue-600 hover:bg-blue-700",
    selected:    "bg-blue-700 ring-2 ring-offset-1 ring-blue-400",
    unavailable: "bg-blue-100",
  },
  buvette: {
    default:     "bg-amber-700 hover:bg-amber-800",
    selected:    "bg-amber-800 ring-2 ring-offset-1 ring-amber-400",
    unavailable: "bg-amber-100",
  },
  loge: {
    default:     "bg-pink-600 hover:bg-pink-700",
    selected:    "bg-pink-700 ring-2 ring-offset-1 ring-pink-400",
    unavailable: "bg-pink-100",
  },
  photo: {
    default:     "bg-violet-600 hover:bg-violet-700",
    selected:    "bg-violet-700 ring-2 ring-offset-1 ring-violet-400",
    unavailable: "bg-violet-100",
  },
  vid: {
    default:     "bg-red-600 hover:bg-red-700",
    selected:    "bg-red-700 ring-2 ring-offset-1 ring-red-400",
    unavailable: "bg-red-100",
  },
  montage: {
    default:     "bg-orange-700 hover:bg-orange-800",
    selected:    "bg-orange-800 ring-2 ring-offset-1 ring-orange-400",
    unavailable: "bg-orange-100",
  },
  demontage: {
    default:     "bg-stone-600 hover:bg-stone-700",
    selected:    "bg-stone-700 ring-2 ring-offset-1 ring-stone-400",
    unavailable: "bg-stone-100",
  },
  preparation: {
    default:     "bg-teal-700 hover:bg-teal-800",
    selected:    "bg-teal-800 ring-2 ring-offset-1 ring-teal-400",
    unavailable: "bg-teal-100",
  },
  _default: {
    default:     "bg-gray-600 hover:bg-gray-700",
    selected:    "bg-gray-700 ring-2 ring-offset-1 ring-gray-400",
    unavailable: "bg-gray-100",
  },
}

const BAR_KEYS: [string, string][] = [
  ["démontage",   "demontage"],
  ["demontage",   "demontage"],
  ["montage",     "montage"],
  ["billetterie", "billetterie"],
  ["buvette",     "buvette"],
  ["loge",        "loge"],
  ["photo",       "photo"],
  ["vid",         "vid"],
  ["préparation", "preparation"],
  ["preparation", "preparation"],
]

// Fallback palette for custom roles — distinct colors, WCAG AA with white text
const FALLBACK_PALETTE: Record<BarState, string>[] = [
  { default: "bg-indigo-600 hover:bg-indigo-700", selected: "bg-indigo-700 ring-2 ring-offset-1 ring-indigo-400", unavailable: "bg-indigo-100" },
  { default: "bg-cyan-700 hover:bg-cyan-800",     selected: "bg-cyan-800 ring-2 ring-offset-1 ring-cyan-400",     unavailable: "bg-cyan-100" },
  { default: "bg-lime-700 hover:bg-lime-800",     selected: "bg-lime-800 ring-2 ring-offset-1 ring-lime-400",     unavailable: "bg-lime-100" },
  { default: "bg-rose-600 hover:bg-rose-700",     selected: "bg-rose-700 ring-2 ring-offset-1 ring-rose-400",     unavailable: "bg-rose-100" },
  { default: "bg-fuchsia-600 hover:bg-fuchsia-700", selected: "bg-fuchsia-700 ring-2 ring-offset-1 ring-fuchsia-400", unavailable: "bg-fuchsia-100" },
  { default: "bg-sky-600 hover:bg-sky-700",       selected: "bg-sky-700 ring-2 ring-offset-1 ring-sky-400",       unavailable: "bg-sky-100" },
  { default: "bg-emerald-700 hover:bg-emerald-800", selected: "bg-emerald-800 ring-2 ring-offset-1 ring-emerald-400", unavailable: "bg-emerald-100" },
  { default: "bg-yellow-700 hover:bg-yellow-800", selected: "bg-yellow-800 ring-2 ring-offset-1 ring-yellow-400", unavailable: "bg-yellow-100" },
]

function hashRole(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h % FALLBACK_PALETTE.length
}

export function getBarClasses(roleName: string, state: BarState): string {
  const lower = roleName.toLowerCase()
  for (const [key, colorKey] of BAR_KEYS) {
    if (lower.includes(key)) return BAR[colorKey][state]
  }
  return FALLBACK_PALETTE[hashRole(lower)][state]
}

const cls = "w-3.5 h-3.5 text-gray-400 flex-shrink-0"
const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: cls,
}

export function RoleIcon({ roleName }: { roleName: string }) {
  const lower = roleName.toLowerCase()

  if (lower.includes("billetterie")) return (
    <svg {...svgProps}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )

  if (lower.includes("buvette")) return (
    <svg {...svgProps}>
      <path d="M18 8h1a4 4 0 010 8h-1" />
      <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  )

  if (lower.includes("loge")) return (
    <svg {...svgProps}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )

  if (lower.includes("photo")) return (
    <svg {...svgProps}>
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )

  if (lower.includes("vid")) return (
    <svg {...svgProps}>
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  )

  if (lower.includes("démontage") || lower.includes("demontage")) return (
    <svg {...svgProps}>
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )

  if (lower.includes("montage")) return (
    <svg {...svgProps}>
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    </svg>
  )

  if (lower.includes("préparation") || lower.includes("preparation")) return (
    <svg {...svgProps}>
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  )

  return null
}
