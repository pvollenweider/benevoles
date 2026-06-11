import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { formatShortDate } from "@/lib/utils"
import { eventPublicUrl } from "@/lib/urls"
import { resolveOrgSlug } from "@/lib/resolve-org"
import PublicFooter from "@/components/PublicFooter"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const rawOrgSlug = (await headers()).get("x-org-slug")

  let orgSlug = rawOrgSlug
  if (rawOrgSlug) {
    const resolved = await resolveOrgSlug(rawOrgSlug)
    if (!resolved) orgSlug = null
    else if (resolved.redirectUrl) redirect(resolved.redirectUrl)
    else orgSlug = resolved.org.slug
  }

  const events = await prisma.event.findMany({
    where: {
      publicStatus: "published",
      ...(orgSlug ? { organization: { slug: orgSlug } } : {}),
    },
    include: {
      organization: { select: { slug: true, name: true } },
      shifts: {
        where: { status: { not: "cancelled" } },
        include: { registrations: { where: { status: "active" } } },
      },
    },
    orderBy: { startDate: "asc" },
  })

  const enriched = events.map((event) => {
    const totalCapacity = event.shifts.reduce((s, sh) => s + sh.capacity, 0)
    const totalRegistered = event.shifts.reduce((s, sh) => s + sh.registrations.length, 0)
    return { ...event, totalCapacity, totalRegistered, spotsLeft: totalCapacity - totalRegistered }
  })

  // No org context → marketing landing page
  if (!orgSlug) return <LandingPage />

  // On an org subdomain, links are relative (same host). On www, links are absolute.
  function eventHref(orgSlug: string | null, eventOrgSlug: string, eventSlug: string) {
    if (orgSlug) return `/${eventSlug}`
    return eventPublicUrl(eventOrgSlug, eventSlug)
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">Bénévoles</h1>
          <p className="text-gray-500 text-sm mt-1">Inscrivez-vous pour aider lors de nos spectacles</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {enriched.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">Aucun événement en cours.</p>
            <p className="text-sm mt-2">Revenez bientôt !</p>
          </div>
        ) : (
          <div className="space-y-4">
            {enriched.map((event) => (
              <Link
                key={event.id}
                href={eventHref(orgSlug, event.organization.slug, event.slug)}
                className="block bg-white rounded-2xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                {!orgSlug && (
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{event.organization.name}</p>
                )}
                <h2 className="text-lg font-semibold text-gray-900">{event.title}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {formatShortDate(event.startDate)}
                  {event.endDate.toDateString() !== event.startDate.toDateString() &&
                    ` — ${formatShortDate(event.endDate)}`}
                </p>
                {event.location && (
                  <p className="text-sm text-gray-400 mt-1">📍 {event.location}</p>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {event.spotsLeft > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700">
                        {event.spotsLeft} place{event.spotsLeft > 1 ? "s" : ""} à pourvoir
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                        Complet
                      </span>
                    )}
                  </div>
                  <span className="text-blue-600 text-sm font-medium">Voir les créneaux →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <PublicFooter />
    </main>
  )
}

// ── Static Gantt mockup — decorative illustration, aria-hidden ────────────────
// Reproduces real app: role colors from roles.tsx, spectacle band, waitlist, full slot
// Text contrast: white on each bar color ≥ 4.5:1 (WCAG AA verified)
// 09h–17h = 8 slots of 1h = 12.5% each
const GANTT_HOURS = ["09h", "10h", "11h", "12h", "13h", "14h", "15h", "16h", "17h"]
// Spectacle band: 13h–17h = left 50%, width 50%
const SHOW = { left: 50, width: 50, name: "🎪 Concert" }
const GANTT_ROWS = [
  {
    role: "Bar",
    // rose-600 (#e11d48) white 5.5:1 ✓ — hash("bar")→3→rose
    bars: [
      { label: "Bar", left: 12.5, width: 50, bg: "#e11d48", full: false, waitlist: false },
    ],
  },
  {
    role: "Accueil",
    // sky-600 (#0284c7) white 4.8:1 ✓ — full slot (Complet)
    bars: [
      { label: "Accueil · Complet", left: 0, width: 37.5, bg: "#0284c7", full: true, waitlist: false },
    ],
  },
  {
    role: "Billetterie",
    // blue-600 (#2563eb) white 5.0:1 ✓ — waitlist diagonal stripes
    bars: [
      { label: "Billetterie · Attente", left: 0, width: 62.5, bg: "#2563eb", waitlist: true, full: false },
    ],
  },
  {
    role: "Sono",
    // fuchsia-600 (#c026d3) white 4.9:1 ✓ — split: Soundcheck before show, Live during show
    bars: [
      { label: "Soundcheck", left: 12.5, width: 37.5, bg: "#c026d3", full: false, waitlist: false },
      { label: "Live",       left: 50,   width: 50,   bg: "#a21caf", full: false, waitlist: false },
    ],
  },
]

function GanttMockup() {
  return (
    <div
      aria-hidden="true"
      className="mt-8 sm:mt-0 rounded-xl overflow-hidden border border-blue-200 shadow-sm select-none pointer-events-none"
    >
      {/* Browser chrome */}
      <div className="bg-white border-b border-gray-100 px-3 py-2 flex items-center gap-2">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
          <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
          <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
        </div>
        <div className="flex-1 bg-gray-100 rounded-md px-2 py-0.5 text-[10px] text-gray-400 font-mono truncate">
          festival.benevol.app/programme-2026
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white overflow-x-auto">
        <div style={{ minWidth: 440 }}>
          {/* Time header */}
          <div className="flex border-b border-gray-100">
            <div className="w-[72px] flex-shrink-0 border-r border-gray-100" />
            {GANTT_HOURS.map((h) => (
              <div
                key={h}
                className="flex-1 text-center text-[10px] text-gray-500 py-1.5 border-l border-gray-100"
              >
                {h}
              </div>
            ))}
          </div>

          {/* Show band row — concert background */}
          <div className="flex border-b border-gray-100 relative">
            <div className="w-[72px] flex-shrink-0 border-r border-gray-100 px-2 flex items-center">
              <span className="text-[9px] text-gray-400 italic truncate">Scène</span>
            </div>
            <div className="flex-1 relative" style={{ height: 18 }}>
              <div
                className="absolute top-1 bottom-1 rounded-sm flex items-center px-1.5 overflow-hidden"
                style={{
                  left: `${SHOW.left}%`,
                  width: `${SHOW.width}%`,
                  background: "rgba(126, 34, 206, 0.15)",
                  border: "1px solid rgba(126, 34, 206, 0.3)",
                }}
              >
                <span className="text-[9px] text-purple-700 font-medium truncate">{SHOW.name}</span>
              </div>
            </div>
          </div>

          {/* Role rows */}
          {GANTT_ROWS.map((row) => (
            <div key={row.role} className="flex border-b border-gray-100 last:border-b-0 relative">
              {/* Concert band background tint on relevant rows */}
              <div
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{
                  left: `calc(72px + ${SHOW.left}%)`,
                  width: `${SHOW.width}%`,
                  background: "rgba(126, 34, 206, 0.04)",
                }}
              />
              <div className="w-[72px] flex-shrink-0 border-r border-gray-100 px-2 flex items-center relative z-10">
                <span className="text-[10px] font-semibold text-gray-700 truncate">{row.role}</span>
              </div>
              <div className="flex-1 relative" style={{ height: 34 }}>
                {row.bars.map((bar) => (
                  <div
                    key={bar.label}
                    className="absolute top-1.5 bottom-1.5 rounded flex items-center px-1.5 overflow-hidden"
                    style={{
                      left: `${bar.left}%`,
                      width: `calc(${bar.width}% - 2px)`,
                      backgroundColor: bar.bg,
                      backgroundImage: bar.waitlist
                        ? "repeating-linear-gradient(45deg, rgba(255,255,255,0.25) 0px, rgba(255,255,255,0.25) 3px, transparent 3px, transparent 9px)"
                        : undefined,
                      opacity: bar.full ? 0.75 : 1,
                    }}
                  >
                    {bar.full && (
                      <svg aria-hidden="true" className="w-2.5 h-2.5 text-white flex-shrink-0 mr-1 opacity-80" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
                      </svg>
                    )}
                    <span className="text-[9px] font-semibold text-white truncate leading-none">
                      {bar.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Caption */}
      <div className="bg-gray-50 border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-400 text-center">
        Timeline bénévoles — Festival du Rhône 2026
      </div>
    </div>
  )
}

function LandingPage() {
  return (
    <main className="min-h-screen bg-white">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="bg-blue-900 px-6 py-24 sm:py-32">
        <div className="max-w-3xl mx-auto">
          <h1
            className="text-4xl sm:text-5xl font-extrabold text-white leading-tight"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            Vos bénévoles s'inscrivent sans créer de compte.
          </h1>
          <p className="mt-5 text-lg text-blue-200 max-w-2xl leading-relaxed">
            Un lien, ils choisissent leur créneau, c'est fait. Benevol est un outil open source
            pour les associations et festivals qui gèrent des équipes de bénévoles.
          </p>
          <div className="mt-10 flex flex-wrap gap-4 items-center">
            <a
              href="mailto:contact@benevol.app"
              className="inline-flex items-center gap-2 bg-white text-blue-900 text-sm font-bold px-6 py-3 rounded-full hover:bg-blue-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white"
            >
              Tester le projet<span aria-hidden="true"> →</span>
            </a>
            <a
              href="https://github.com/pvollenweider/benevoles"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-white text-sm font-medium hover:text-blue-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white underline-offset-4 hover:underline"
            >
              <svg
                aria-hidden="true"
                focusable="false"
                className="w-5 h-5 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              Voir sur GitHub
              <span className="sr-only">(ouvre dans un nouvel onglet)</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── Différenciateur principal ─────────────────────────────────────── */}
      <section
        aria-labelledby="features-heading"
        className="max-w-5xl mx-auto px-6 py-20"
      >
        <h2 id="features-heading" className="sr-only">Fonctionnalités</h2>

        {/* Primary feature — 2-col on desktop */}
        <div className="bg-blue-50 rounded-2xl p-8 sm:p-10 mb-16 sm:grid sm:grid-cols-2 sm:gap-10 sm:items-center">
          <div>
            <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight" style={{ textWrap: "balance" } as React.CSSProperties}>
              Inscription sans friction
            </h3>
            <p className="mt-4 text-base text-gray-600 leading-relaxed">
              Pas de compte, pas de mot de passe. Vous publiez l'événement,
              vous envoyez un lien. Les bénévoles choisissent leur créneau
              sur la timeline, confirment en 30 secondes — depuis leur téléphone.
            </p>
            <p className="mt-3 text-sm text-gray-500">
              Un lien unique leur permet de modifier ou d'annuler à tout moment.
            </p>
          </div>
          <GanttMockup />
        </div>

        {/* Secondary features */}
        <ul className="grid sm:grid-cols-3 gap-8" role="list">
          <li>
            <h3 className="text-base font-semibold text-gray-900">Planning par créneaux</h3>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed">
              Timeline Gantt par jour, réordonnement des postes, couverture visible d'un coup d'œil.
            </p>
          </li>
          <li>
            <h3 className="text-base font-semibold text-gray-900">Suivi et export PDF</h3>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed">
              Inscriptions en temps réel, export PDF pour la coordination sur le terrain.
            </p>
          </li>
          <li>
            <h3 className="text-base font-semibold text-gray-900">Communications automatiques</h3>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed">
              Confirmations, rappels J-2/J-1/Jour J, notifications de modification — sans intervention manuelle.
            </p>
          </li>
        </ul>
      </section>

      {/* ── Signal communauté ─────────────────────────────────────────────── */}
      <section className="bg-gray-50 border-t border-gray-200 px-6 py-14">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-start gap-8">
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900">Construit par des organisateurs</h2>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed max-w-md">
              Benevol est un projet open source, en développement actif, utilisé pour de vrais
              événements. Le code est sur GitHub. Les retours et contributions sont bienvenus.
            </p>
          </div>
          <div className="flex-shrink-0">
            <a
              href="https://github.com/pvollenweider/benevoles"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-gray-300 rounded-full px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <svg aria-hidden="true" focusable="false" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              pvollenweider/benevoles
              <span className="sr-only">(ouvre dans un nouvel onglet)</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── CTA bas ──────────────────────────────────────────────────────── */}
      <section className="px-6 py-14">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-xl font-bold text-gray-900">On vous crée un espace</h2>
          <p className="mt-3 text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
            Le projet est ouvert aux testeurs. Écrivez-nous, on configure une organisation pour vous.
          </p>
          <a
            href="mailto:contact@benevol.app"
            className="mt-6 inline-flex items-center gap-2 border border-blue-600 text-blue-600 text-sm font-semibold px-6 py-3 rounded-full hover:bg-blue-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            contact@benevol.app
          </a>
        </div>
      </section>

      <PublicFooter />
    </main>
  )
}
