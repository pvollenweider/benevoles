import Link from "next/link"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import type { Metadata, Viewport } from "next"
import { prisma } from "@/lib/prisma"
import { formatShortDate } from "@/lib/utils"
import { resolveOrgSlug } from "@/lib/resolve-org"
import Image from "next/image"
import GitHubMark from "@/components/GitHubMark"
import PublicFooter from "@/components/PublicFooter"
import OrgLogoImage from "@/components/OrgLogoImage"
import { ORG_LOGO_SELECT, orgLogoOf, type OrgLogo } from "@/lib/org-logo"
import { apexBaseUrl, orgBaseUrl } from "@/lib/urls"
import { orgHomeMetadata } from "@/lib/event-share"
import { PUBLIC_LIST_WHERE } from "@/lib/event-visibility"
import { CONTACT_EMAIL, LANDING_FAQ, REPOSITORY_URL, jsonLdScript, landingJsonLd, landingMetadata } from "@/lib/landing-seo"
import { loadDocUnits } from "@/lib/doc-units"
import { landingQuickstartLink, landingStartLinks, landingVolunteerGuideLink } from "@/lib/landing-start-guides"
import LandingStartGuides from "@/components/public/LandingStartGuides"

export const dynamic = "force-dynamic"

const DEFAULT_TITLE = "Bénévoles"

// The browser bar takes the hero's colour on the apex home only: organisation pages have their
// own header colour.
export async function generateViewport(): Promise<Viewport> {
  const rawOrgSlug = (await headers()).get("x-org-slug")
  return rawOrgSlug ? {} : { themeColor: "#1e3a8a" }
}

// Document title = the organization's public title (h1), default "Bénévoles".
// resolveOrgSlug is cached per request, so this adds no extra query.
export async function generateMetadata(): Promise<Metadata> {
  const rawOrgSlug = (await headers()).get("x-org-slug")
  // The marketing home of the apex host: its own title, description, social card and structured
  // data (src/lib/landing-seo.ts), canonical on the apex.
  if (!rawOrgSlug) return landingMetadata(apexBaseUrl())
  const resolved = await resolveOrgSlug(rawOrgSlug)
  if (!resolved || resolved.redirectUrl) return {}
  // The organisation's page shared in a message or found in a search (#564 for its events).
  return orgHomeMetadata(
    { name: resolved.org.name, title: resolved.org.publicTitle?.trim() || DEFAULT_TITLE },
    { canonicalUrl: `${orgBaseUrl(resolved.org.slug)}/`, imageUrl: `${apexBaseUrl()}/og-image.png` },
  )
}

export default async function HomePage() {
  const rawOrgSlug = (await headers()).get("x-org-slug")

  let orgSlug = rawOrgSlug
  let orgName: string | null = null
  let orgTitle = DEFAULT_TITLE
  let orgLogo: OrgLogo | null = null
  if (rawOrgSlug) {
    const resolved = await resolveOrgSlug(rawOrgSlug)
    // An unknown organisation's subdomain (a typo, a deleted or never created organisation) is a
    // real 404, not a copy of the marketing home that search engines would index (#759).
    if (!resolved) notFound()
    else if (resolved.redirectUrl) redirect(resolved.redirectUrl)
    else {
      orgSlug = resolved.org.slug
      orgName = resolved.org.name
      orgTitle = resolved.org.publicTitle?.trim() || DEFAULT_TITLE
      // The organization's logo (#300): its metadata only, the image comes from its own URL.
      const logo = await prisma.organizationLogo.findUnique({ where: { organizationId: resolved.org.id }, ...ORG_LOGO_SELECT })
      orgLogo = orgLogoOf(resolved.org.id, logo)
    }
  }

  // No org context → marketing landing page (no data needed)
  if (!orgSlug) return <LandingPage />

  // Hide events that are already over: they would show "N places à pourvoir".
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const events = await prisma.event.findMany({
    where: {
      ...PUBLIC_LIST_WHERE,
      organization: { slug: orgSlug },
      endDate: { gte: startOfToday },
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

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-2xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* Decorative when the name is written beside it (above the title, or as the title itself). */}
          {orgLogo && orgName && (
            <OrgLogoImage logo={orgLogo} organizationName={orgName} nameShownBeside maxWidth={128} maxHeight={56} />
          )}
          <div className="min-w-0 basis-60 grow">
            {orgName && orgName !== orgTitle && <p className="text-sm text-gray-600 break-words">{orgName}</p>}
            <h1 className="text-2xl font-bold text-gray-900 break-words">{orgTitle}</h1>
            <p className="text-gray-500 text-sm mt-1">Inscrivez-vous pour aider lors de nos événements</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {enriched.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">Aucun événement en cours.</p>
            <p className="text-sm mt-2">Revenez bientôt !</p>
          </div>
        ) : (
          <div className="space-y-4">
            {enriched.map((event) => (
              <Link
                key={event.id}
                href={`/${event.slug}`}
                className="block bg-white rounded-2xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <h2 className="text-lg font-semibold text-gray-900">{event.title}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {formatShortDate(event.startDate)}
                  {event.endDate.toDateString() !== event.startDate.toDateString() &&
                    ` — ${formatShortDate(event.endDate)}`}
                </p>
                {event.location && (
                  <p className="text-sm text-gray-500 mt-1">📍 {event.location}</p>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {event.spotsLeft > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        {event.spotsLeft} place{event.spotsLeft > 1 ? "s" : ""} à pourvoir
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
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

// ── Apex home ────────────────────────────────────────────────────────────────
// Everything stated here is shipped (FEATURES.md is the full list, linked below) or stated by the
// legal pages (free, hosted in France, no tracking cookie). The FAQ text comes from
// src/lib/landing-seo.ts, which also feeds the FAQPage structured data.

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"

const STEPS = [
  {
    title: "Vous préparez le planning",
    text: "Des postes, des créneaux, un nombre de places. Partez d'un modèle (festival, buvette, fête de village) ou de l'édition de l'an dernier, décalée à la bonne date.",
  },
  {
    title: "Vous partagez un lien",
    text: "Votre page, à l'adresse de votre association, s'envoie par email, se poste sur les réseaux ou s'imprime sur une affiche. Vous pouvez aussi inviter directement les membres de votre équipe.",
  },
  {
    title: "Ils choisissent leurs créneaux",
    text: "Depuis leur téléphone, sans compte ni mot de passe. Ils reçoivent une confirmation, des rappels, et un lien personnel pour modifier ou annuler.",
  },
]

const BENEFITS = [
  {
    title: "Vous savez où il manque du monde",
    text: "Le tableau de bord commence par ce qui presse : créneaux pas encore complets, demandes à valider, places de liste d'attente qui expirent. Une page par événement classe les créneaux du plus dégarni au presque complet, et chaque ligne mène là où on agit.",
    image: "/doc-img/admin-staffing.png",
    alt: "Page « Où manque-t-il du monde ? » : 29 places pourvues sur 44, puis la liste des créneaux à compléter, chacun avec sa barre de remplissage et le nombre de personnes qui manquent.",
  },
  {
    title: "Les messages partent tout seuls",
    text: "Confirmation à l'inscription, rappels deux jours avant, la veille et le jour même. Quand une place se libère, la personne suivante sur la liste d'attente est prévenue. Pour le reste, écrivez à tous les inscrits, à un poste ou à un créneau, avec un aperçu avant l'envoi.",
    image: "/doc-img/admin-message.png",
    alt: "Page « Écrire aux bénévoles » : choix des destinataires (tous les inscrits, un poste, un créneau, la liste d'attente, les invités sans créneau) et modèles de message réutilisables.",
  },
  {
    title: "Le jour J tient sur une feuille",
    text: "Plannings par jour, par poste ou par bénévole, feuille de présence à cocher, badges à découper : tout s'imprime lisiblement en noir et blanc, ou s'enregistre en PDF.",
    image: "/doc-img/admin-print.png",
    alt: "Page « Rapports » : export complet, archive de l'événement, plannings par jour, par poste et individuel, prêts à imprimer.",
  },
]

function LandingPage() {
  // The documentation's entry points (#764): titles and summaries read from guide/.
  const units = loadDocUnits()
  const quickstart = landingQuickstartLink(units)
  return (
    <>
    <main className="min-h-screen bg-white text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(landingJsonLd(apexBaseUrl())) }} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="bg-blue-900 px-4 sm:px-6 pt-16 pb-0 sm:pt-24 overflow-hidden">
        <div className="max-w-6xl mx-auto grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end">
          <div className="pb-4 lg:pb-24">
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.05] tracking-tight"
              style={{ textWrap: "balance" } as React.CSSProperties}
            >
              Un lien, et vos bénévoles s&apos;inscrivent.
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-blue-100 max-w-xl leading-relaxed" style={{ textWrap: "pretty" } as React.CSSProperties}>
              Ils choisissent leurs créneaux sur leur téléphone, sans créer de compte. Vous voyez où il
              manque du monde, les rappels partent tout seuls, et le jour J tient sur une feuille.
            </p>
            <p className="mt-3 text-base text-blue-200 max-w-xl leading-relaxed">
              Pour les festivals, les buvettes, les fêtes de village et toutes les associations qui
              comptent sur des bénévoles.
            </p>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-4 items-center">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className={`inline-flex items-center gap-2 bg-white text-blue-900 text-base font-bold px-7 py-3.5 rounded-full hover:bg-blue-50 transition-colors ${focusRing} focus-visible:outline-white`}
              >
                Demander un espace<span className="sr-only"> par email ({CONTACT_EMAIL})</span><span aria-hidden="true"> →</span>
              </a>
              {quickstart && (
                <Link
                  href={quickstart.href}
                  className={`inline-flex items-center gap-2 py-2 text-white text-base font-semibold underline underline-offset-4 decoration-blue-300 hover:decoration-white rounded ${focusRing} focus-visible:outline-white`}
                >
                  {/* Says it opens a guide: the page creates nothing by itself. */}
                  Guide&nbsp;: créer son premier événement<span aria-hidden="true"> →</span>
                </Link>
              )}
              <a
                href={REPOSITORY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 py-2 text-white text-base font-medium underline-offset-4 hover:underline rounded ${focusRing} focus-visible:outline-white`}
              >
                <GitHubMark className="w-5 h-5" />
                Voir le code
                <span className="sr-only"> (ouvre dans un nouvel onglet)</span>
              </a>
            </div>
            <p className="mt-8 text-sm text-blue-200">
              Gratuit <span aria-hidden="true">·</span> Open source <span aria-hidden="true">·</span> Hébergé en France
            </p>
          </div>

          {/* The volunteer's side, on a phone: the real sign-up page of the demo event. */}
          <div className="mx-auto w-full max-w-[300px] lg:max-w-[340px]">
            <div className="rounded-t-[2.25rem] border-[10px] border-b-0 border-gray-950 bg-gray-950 shadow-2xl">
              <div className="relative aspect-[390/700] overflow-hidden rounded-t-[1.6rem] bg-white">
                <Image
                  src="/doc-img/public-timeline-mobile.png"
                  width={780}
                  height={1688}
                  alt="La page d'inscription sur un téléphone : la Fête du village de Montvert, ses postes (Montage, Accueil, Buvette, Navette, Sécurité) sur une frise horaire, avec les places prises et les créneaux complets."
                  sizes="(min-width: 1024px) 320px, 280px"
                  loading="eager"
                  fetchPriority="high"
                  className="absolute inset-x-0 top-0 w-full h-auto"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Comment ça marche ────────────────────────────────────────────── */}
      <section aria-labelledby="steps-heading" className="px-4 sm:px-6 py-20 sm:py-24">
        <div className="max-w-6xl mx-auto">
          <h2 id="steps-heading" className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ textWrap: "balance" } as React.CSSProperties}>
            Prêt en trois étapes
          </h2>
          <ol role="list" className="mt-12 grid gap-10 md:grid-cols-3 md:gap-12">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span aria-hidden="true" className="block text-5xl font-extrabold text-blue-700 leading-none">{i + 1}</span>
                <h3 className="mt-4 text-xl font-semibold">
                  <span className="sr-only">Étape {i + 1} : </span>
                  {step.title}
                </h3>
                <p className="mt-3 text-base text-gray-600 leading-relaxed">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Bien démarrer : the essential guides ──────────────────────────── */}
      <LandingStartGuides links={landingStartLinks(units)} guide={landingVolunteerGuideLink()} />

      {/* ── Ce qui change pour vous ──────────────────────────────────────── */}
      <section aria-labelledby="benefits-heading" className="bg-gray-50 border-y border-gray-200 px-4 sm:px-6 py-20 sm:py-24">
        <div className="max-w-6xl mx-auto">
          <h2 id="benefits-heading" className="text-3xl sm:text-4xl font-bold tracking-tight max-w-2xl" style={{ textWrap: "balance" } as React.CSSProperties}>
            Moins de tableurs, moins de relances, plus de temps pour la fête
          </h2>
          <div className="mt-16 space-y-20 sm:space-y-28">
            {BENEFITS.map((b, i) => (
              <div key={b.title} className="grid gap-8 lg:grid-cols-12 lg:gap-12 lg:items-center">
                <div className={`lg:col-span-5 ${i % 2 === 1 ? "lg:order-2 lg:col-start-8" : ""}`}>
                  <h3 className="text-2xl font-bold tracking-tight" style={{ textWrap: "balance" } as React.CSSProperties}>{b.title}</h3>
                  <p className="mt-4 text-base sm:text-lg text-gray-600 leading-relaxed" style={{ textWrap: "pretty" } as React.CSSProperties}>{b.text}</p>
                </div>
                <div className={`lg:col-span-7 ${i % 2 === 1 ? "lg:order-1 lg:col-start-1" : ""}`}>
                  <Image
                    src={b.image}
                    width={1280}
                    height={800}
                    alt={b.alt}
                    sizes="(min-width: 1024px) 640px, 100vw"
                    className="w-full h-auto rounded-xl border border-gray-200 shadow-lg bg-white"
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-20 text-center">
            <Link href="/fonctionnalites" className={`text-lg font-semibold text-blue-700 underline underline-offset-4 hover:text-blue-900 rounded ${focusRing} focus-visible:outline-blue-700`}>
              Voir toutes les fonctionnalités<span aria-hidden="true"> →</span>
            </Link>
          </p>
        </div>
      </section>

      {/* ── Confiance ────────────────────────────────────────────────────── */}
      <section aria-labelledby="trust-heading" className="px-4 sm:px-6 py-20 sm:py-24">
        <div className="max-w-6xl mx-auto">
          <h2 id="trust-heading" className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ textWrap: "balance" } as React.CSSProperties}>
            Un outil sur lequel compter
          </h2>
          <dl className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
            <div>
              <dt className="text-lg font-semibold">Gratuit et open source</dt>
              <dd className="mt-2 text-base text-gray-600 leading-relaxed">
                Pas d&apos;abonnement ni de version payante. Le code est public, sous licence AGPL-3.0,
                et l&apos;outil grandit avec les retours des associations qui l&apos;utilisent.
              </dd>
            </div>
            <div>
              <dt className="text-lg font-semibold">Hébergé en France, sans pistage</dt>
              <dd className="mt-2 text-base text-gray-600 leading-relaxed">
                L&apos;application et sa base de données sont chez OVH, en France. Aucun cookie de
                pistage, analytique ou publicitaire.{" "}
                <Link href="/legal/privacy" className={`text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing} focus-visible:outline-blue-700`}>
                  Politique de confidentialité
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-lg font-semibold">Vos données restent les vôtres</dt>
              <dd className="mt-2 text-base text-gray-600 leading-relaxed">
                Chaque organisation ne voit que ses événements et ses bénévoles. Membres, journal
                d&apos;activité, archive complète d&apos;un événement : tout s&apos;exporte, à tout moment.
              </dd>
            </div>
            <div>
              <dt className="text-lg font-semibold">Pensé pour tout le monde</dt>
              <dd className="mt-2 text-base text-gray-600 leading-relaxed">
                Inscription et administration conçues pour le clavier et les lecteurs d&apos;écran,
                vérifiées à chaque modification.{" "}
                <Link href="/accessibilite" className={`text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing} focus-visible:outline-blue-700`}>
                  Déclaration d&apos;accessibilité
                </Link>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ── FAQ (same text as the FAQPage structured data) ───────────────── */}
      <section aria-labelledby="faq-heading" className="bg-gray-50 border-t border-gray-200 px-4 sm:px-6 py-20 sm:py-24">
        <div className="max-w-3xl mx-auto">
          <h2 id="faq-heading" className="text-3xl sm:text-4xl font-bold tracking-tight">Questions fréquentes</h2>
          <div className="mt-10 divide-y divide-gray-200 border-y border-gray-200">
            {LANDING_FAQ.map((f) => (
              <details key={f.question} className="group">
                <summary className={`flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-semibold rounded [&::-webkit-details-marker]:hidden ${focusRing} focus-visible:outline-blue-700`}>
                  {f.question}
                  <span aria-hidden="true" className="text-2xl font-normal text-blue-700 transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
                </summary>
                <div className="pb-6 pr-8 text-base text-gray-600 leading-relaxed">
                  <p>{f.answer}</p>
                  {f.link && (
                    <p className="mt-2">
                      {f.link.href.startsWith("http") ? (
                        <a href={f.link.href} target="_blank" rel="noopener noreferrer" className={`text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing} focus-visible:outline-blue-700`}>
                          {f.link.label}
                          <span className="sr-only"> (ouvre dans un nouvel onglet)</span>
                        </a>
                      ) : (
                        <Link href={f.link.href} className={`text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing} focus-visible:outline-blue-700`}>
                          {f.link.label}
                        </Link>
                      )}
                    </p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA bas ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="cta-heading" className="bg-blue-900 px-4 sm:px-6 py-20">
        <div className="max-w-2xl mx-auto text-center">
          <h2 id="cta-heading" className="text-3xl sm:text-4xl font-bold text-white tracking-tight" style={{ textWrap: "balance" } as React.CSSProperties}>
            Votre prochain événement commence ici
          </h2>
          <p className="mt-4 text-lg text-blue-100 leading-relaxed">
            Écrivez-nous : on vous crée un espace à l&apos;adresse de votre association, et une liste
            de premiers pas vous guide jusqu&apos;à la publication.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className={`mt-8 inline-flex items-center gap-2 bg-white text-blue-900 text-base font-bold px-7 py-3.5 rounded-full hover:bg-blue-50 transition-colors ${focusRing} focus-visible:outline-white`}
          >
            {CONTACT_EMAIL}
          </a>
        </div>
      </section>

      {/* The `site` footer (help, sign-in, support appeal) on benevol.app's own pages only (this
          page and ContentShell), not on the org-subdomain events list above or any
          volunteer-facing page: those are seen by someone else's audience, registering for
          someone else's event, not benevol.app's own. */}
    </main>
      <PublicFooter variant="site" />
    </>
  )
}
