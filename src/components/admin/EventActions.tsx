import Link from "next/link"

/**
 * Actions of the admin event page: three primary links, then the event's tools.
 * On a phone the primary links show a short label (« Créneaux », « Inscriptions », « Inviter »):
 * the long one is display:none there, so the accessible name is always the visible text (WCAG 2.5.3).
 * The tools are 44 px targets: one two-column panel on a phone, a row of chips from `sm` up.
 */

type Primary = { path: string; short: string; long: string; primary: boolean }

export const PRIMARY_ACTIONS: Primary[] = [
  { path: "shifts", short: "Créneaux", long: "Gérer les créneaux", primary: true },
  { path: "registrations", short: "Inscriptions", long: "Voir les inscriptions", primary: true },
  { path: "invitations", short: "Inviter", long: "Inviter des membres", primary: false },
]

export const EVENT_TOOLS: { path: string; label: string }[] = [
  { path: "qr", label: "QR code" },
  { path: "print", label: "Rapports" },
  { path: "log", label: "Journal" },
  { path: "pages", label: "Pages" },
  { path: "questions", label: "Questions" },
  { path: "sector-leaders", label: "Responsables de secteur" },
  { path: "duplicate", label: "Dupliquer" },
]

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

export default function EventActions({ eventId }: { eventId: string }) {
  const base = `/admin/events/${eventId}`
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Actions principales" className="flex flex-wrap gap-2 sm:flex-nowrap sm:gap-3">
        {PRIMARY_ACTIONS.map((a) => (
          <Link
            key={a.path}
            href={`${base}/${a.path}`}
            className={`flex min-h-11 items-center justify-center rounded-xl px-3 text-center text-sm transition-colors flex-1 sm:px-5 ${FOCUS} ${
              a.primary
                ? "border border-transparent bg-blue-600 font-semibold text-white hover:bg-blue-700"
                : "border border-gray-300 font-medium text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="sm:hidden">{a.short}</span>{" "}
            <span className="hidden sm:inline">{a.long}</span>
          </Link>
        ))}
      </div>
      <nav aria-label="Outils de l'événement">
        {/* Phone: one panel, cells split by 1 px gaps on a gray backing (no overflow-hidden, it would clip
            the focus outline: the outline is drawn inside the cell instead). The gaps vanish in forced colors,
            where each cell gets a 1 px outline instead. From sm: a row of chips. */}
        <ul className="grid grid-cols-2 gap-px rounded-xl border border-gray-200 bg-gray-200 sm:flex sm:flex-wrap sm:gap-2 sm:border-0 sm:bg-transparent">
          {EVENT_TOOLS.map((t, i) => (
            <li
              key={t.path}
              className={`bg-white forced-colors:outline forced-colors:outline-1 sm:bg-transparent sm:forced-colors:outline-0 ${i === 0 ? "rounded-tl-xl" : ""} ${i === 1 ? "rounded-tr-xl" : ""} ${i === EVENT_TOOLS.length - 1 ? (EVENT_TOOLS.length % 2 ? "col-span-2 rounded-b-xl" : "rounded-br-xl") : ""} ${i === EVENT_TOOLS.length - 2 && EVENT_TOOLS.length % 2 === 0 ? "rounded-bl-xl" : ""}`}
            >
              <Link
                href={`${base}/${t.path}`}
                className="flex h-full min-h-11 items-center rounded-[inherit] px-3 text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:rounded-xl sm:border sm:border-gray-200 sm:bg-white sm:hover:border-gray-300 sm:focus-visible:outline-offset-2"
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
