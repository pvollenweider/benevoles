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

function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-gray-50 border-b border-gray-200 px-6 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-block mb-4 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
            Projet communautaire · En développement actif
          </div>
          <h1 className="text-4xl font-bold text-gray-900 leading-tight">
            Gérez vos bénévoles simplement
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-xl mx-auto">
            Benevol est un outil open source pour les associations et festivals qui organisent des événements avec des équipes de bénévoles.
          </p>
          <a
            href="mailto:contact@benevol.app"
            className="mt-8 inline-block bg-blue-600 text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-blue-700 transition-colors"
          >
            Tester le projet →
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <div className="grid sm:grid-cols-2 gap-6">
          <FeatureCard
            icon="📅"
            title="Planning par créneaux"
            description="Créez vos postes et créneaux horaires en quelques clics. Visualisez la couverture de votre événement sur une timeline interactive."
          />
          <FeatureCard
            icon="👋"
            title="Inscription publique"
            description="Vos bénévoles s'inscrivent sans créer de compte. Un lien, un clic, et c'est fait — depuis un téléphone ou un ordinateur."
          />
          <FeatureCard
            icon="📊"
            title="Suivi en temps réel"
            description="Consultez les inscriptions au fil de l'eau. Exportez vos listes en Excel ou PDF pour la coordination sur le terrain."
          />
          <FeatureCard
            icon="✉️"
            title="Communications automatiques"
            description="Confirmations d'inscription, rappels avant l'événement, notifications de modification — tout est géré automatiquement."
          />
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-50 border-t border-gray-200 px-6 py-14">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-xl font-semibold text-gray-900">Vous voulez tester ?</h2>
          <p className="mt-2 text-gray-500 text-sm">
            Le projet est en développement actif et ouvert aux testeurs externes. Écrivez-nous et on vous crée un espace.
          </p>
          <a
            href="mailto:contact@benevol.app"
            className="mt-6 inline-block border border-blue-600 text-blue-600 text-sm font-semibold px-6 py-3 rounded-full hover:bg-blue-50 transition-colors"
          >
            contact@benevol.app
          </a>
        </div>
      </section>

      <PublicFooter />
    </main>
  )
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <div className="text-2xl mb-3">{icon}</div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
  )
}
