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
import { SITE_CONTAINER_CLASS } from "@/components/public/site-container"
import { isHostedService } from "@/lib/site"
import { SITE_NAME, seoMetadata } from "@/lib/seo-metadata"
import { isSignupOpen } from "@/lib/signup-switch"
import { env } from "@/lib/env"
import { loadHomeSignupVideo } from "@/lib/public-content"
import HomeSignupVideo from "@/components/public/HomeSignupVideo"

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
  if (!rawOrgSlug) return isHostedService() ? landingMetadata(apexBaseUrl()) : instanceHomeMetadata(apexBaseUrl())
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

  // No org context → the hosted service's marketing landing page, or this instance's own home (#760).
  if (!orgSlug) return isHostedService() ? <LandingPage /> : await InstanceHome()

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
    <>
    <main className="flex-1 bg-gray-50">
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
    </main>
    {/* After </main>: a footer inside main loses its contentinfo role. */}
    <div className="px-4"><PublicFooter /></div>
    </>
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
    text: "Vous créez les postes, puis pour chacun les créneaux et le nombre de places. Pour aller plus vite, partez d'un modèle (festival, buvette, fête de village) ou dupliquez l'édition de l'an dernier, décalée à la bonne date.",
  },
  {
    title: "Vous partagez un lien",
    text: "La page d'inscription porte l'adresse de votre association. Envoyez le lien par email, postez-le sur les réseaux ou imprimez-le sur une affiche. Les membres de votre équipe, vous pouvez aussi les inviter directement.",
  },
  {
    title: "Ils choisissent leurs créneaux",
    text: "Ils s'inscrivent depuis leur téléphone, sans compte ni mot de passe. Un email confirme l'inscription, les rappels suivent, et chacun garde un lien personnel pour modifier ou annuler.",
  },
]

const BENEFITS = [
  {
    title: "Vous savez où il manque du monde",
    text: "En haut du tableau de bord, il y a ce qui presse : les créneaux pas encore complets, les demandes à valider, les places de liste d'attente qui vont expirer. Chaque événement a aussi une page qui classe ses créneaux du plus dégarni au presque complet, et chaque ligne mène directement à l'écran où agir.",
    image: "/doc-img/admin-staffing.png",
    alt: "Page « Où manque-t-il du monde ? » : 29 places pourvues sur 44, puis la liste des créneaux à compléter, chacun avec sa barre de remplissage et le nombre de personnes qui manquent.",
  },
  {
    title: "Les messages partent tout seuls",
    text: "Chaque bénévole reçoit une confirmation quand il s'inscrit, puis un rappel deux jours avant, la veille et le jour même. Quand une place se libère, la personne suivante sur la liste d'attente est prévenue. Pour tout le reste, vous écrivez vous-même à tous les inscrits, à un poste ou à un créneau, et vous relisez l'aperçu avant l'envoi.",
    image: "/doc-img/admin-message.png",
    alt: "Page « Écrire aux bénévoles » : choix des destinataires (tous les inscrits, un poste, un créneau, la liste d'attente, les invités sans créneau) et modèles de message réutilisables.",
  },
  {
    title: "Le jour J tient sur une feuille",
    text: "Vous imprimez le planning par jour, par poste ou par bénévole, la feuille de présence à cocher et les badges à découper. Tout reste lisible en noir et blanc, et chaque document peut aussi s'enregistrer en PDF.",
    image: "/doc-img/admin-print.png",
    alt: "Page « Rapports » : export complet, archive de l'événement, plannings par jour, par poste et individuel, prêts à imprimer.",
  },
]

/** The home of an instance that is not the hosted service (#760): its marketing describes that service. */
function instanceHomeMetadata(base: string): Metadata {
  return seoMetadata({
    base,
    path: "/",
    title: "Planning et inscriptions des bénévoles",
    description: `${SITE_NAME} : le planning des bénévoles, les inscriptions en ligne par créneau, les rappels et le jour J, pour les associations de cette instance.`,
    type: "website",
    imageAlt: SITE_NAME,
  })
}

async function InstanceHome() {
  const links = [
    { href: "/admin/login", label: "Espace organisateur" },
    // The configuration and the operator's switch (#810), as on the sign-up page.
    ...((await isSignupOpen()) ? [{ href: "/inscription", label: "Demander un espace" }] : []),
    { href: "/fonctionnalites", label: "Fonctionnalités" },
    { href: "/doc", label: "Documentation" },
  ]
  return (
    <>
      <main className={`${SITE_CONTAINER_CLASS} flex-1 py-16`}>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">{SITE_NAME}</h1>
        <p className="mt-4 max-w-[65ch] text-lg text-gray-700 leading-relaxed">
          Le planning des bénévoles : les associations publient leurs créneaux, chaque bénévole
          s&apos;inscrit en ligne, et les rappels partent tout seuls.
        </p>
        <ul className="mt-8 flex flex-wrap gap-3">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={`inline-flex items-center min-h-11 px-5 rounded-full border border-gray-500 text-base font-medium text-gray-900 hover:bg-gray-50 ${focusRing} focus-visible:outline-blue-700`}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <div className={SITE_CONTAINER_CLASS}>
        <PublicFooter variant="site" />
      </div>
    </>
  )
}

function LandingPage() {
  // The documentation's entry points (#764): titles and summaries read from guide/.
  const units = loadDocUnits()
  const quickstart = landingQuickstartLink(units)
  // The phone plays the volunteer sign-up video in place (#765) when it can play here.
  const signupVideo = loadHomeSignupVideo(env.VIDEO_MEDIA_BASE_URL)
  const phoneStill = (
    <Image
      src="/doc-img/public-timeline-mobile.png"
      width={780}
      height={1688}
      alt="La page d'inscription sur un téléphone : la Fête du village de Montvert, ses postes (Montage, Accueil, Buvette, Navette, Sécurité) sur une frise horaire, avec les places prises et les créneaux complets."
      // The frame's inner width (300 or 340 px less its 10 px borders). The 512 px width
      // of next.config.ts `images.imageSizes` serves it to 1.75x screens (#773).
      sizes="(min-width: 1024px) 320px, 280px"
      loading="eager"
      fetchPriority="high"
      className="absolute inset-x-0 top-0 w-full h-auto"
    />
  )
  return (
    <>
    <main className="min-h-screen bg-white text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(landingJsonLd(apexBaseUrl())) }} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="bg-blue-900 pt-16 pb-0 sm:pt-24 overflow-hidden">
        <div className={`${SITE_CONTAINER_CLASS} grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end`}>
          <div className="pb-4 lg:pb-24">
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.05] tracking-tight"
              style={{ textWrap: "balance" } as React.CSSProperties}
            >
              Un lien, et vos bénévoles s&apos;inscrivent.
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-blue-100 max-w-xl leading-relaxed" style={{ textWrap: "pretty" } as React.CSSProperties}>
              Ils choisissent leurs créneaux sur leur téléphone, sans créer de compte. Vous voyez tout de
              suite où il manque du monde, et l&apos;application envoie les rappels à votre place. Le jour
              J, le planning s&apos;imprime sur une feuille.
            </p>
            <p className="mt-3 text-base text-blue-200 max-w-xl leading-relaxed">
              Fait pour les festivals, les buvettes et les fêtes de village, mais aussi pour toute
              association qui a besoin de bénévoles sur des créneaux.
            </p>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-4 items-center">
              <Link
                href="/inscription"
                className={`inline-flex items-center gap-2 bg-white text-blue-900 text-base font-bold px-7 py-3.5 rounded-full hover:bg-blue-50 transition-colors ${focusRing} focus-visible:outline-white`}
              >
                Demander un espace<span aria-hidden="true"> →</span>
              </Link>
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

          {/* The volunteer's side, on a phone: the real sign-up page of the demo event, which plays
              the sign-up video in place when it can (#765). */}
          <div className="mx-auto w-full max-w-[300px] lg:max-w-[340px]">
            <div className="rounded-t-[2.25rem] border-[10px] border-b-0 border-gray-950 bg-gray-950 shadow-2xl">
              {signupVideo ? (
                <HomeSignupVideo video={signupVideo}>{phoneStill}</HomeSignupVideo>
              ) : (
                <div className="relative aspect-[390/700] overflow-hidden rounded-t-[1.6rem] bg-white">{phoneStill}</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Comment ça marche ────────────────────────────────────────────── */}
      <section aria-labelledby="steps-heading" className="py-20 sm:py-24">
        <div className={SITE_CONTAINER_CLASS}>
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
                <p className="mt-3 max-w-[65ch] text-base text-gray-600 leading-relaxed">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Bien démarrer : the essential guides ──────────────────────────── */}
      <LandingStartGuides links={landingStartLinks(units)} guide={landingVolunteerGuideLink()} />

      {/* ── Ce qui change pour vous ──────────────────────────────────────── */}
      <section aria-labelledby="benefits-heading" className="bg-gray-50 border-y border-gray-200 py-20 sm:py-24">
        <div className={SITE_CONTAINER_CLASS}>
          <h2 id="benefits-heading" className="text-3xl sm:text-4xl font-bold tracking-tight max-w-2xl" style={{ textWrap: "balance" } as React.CSSProperties}>
            Moins de tableurs, moins de relances, plus de temps pour la fête
          </h2>
          <div className="mt-16 space-y-20 sm:space-y-28">
            {BENEFITS.map((b, i) => (
              <div key={b.title} className="grid gap-8 lg:grid-cols-12 lg:gap-12 lg:items-center">
                <div className={`lg:col-span-5 ${i % 2 === 1 ? "lg:order-2 lg:col-start-8" : ""}`}>
                  <h3 className="text-2xl font-bold tracking-tight" style={{ textWrap: "balance" } as React.CSSProperties}>{b.title}</h3>
                  <p className="mt-4 max-w-[65ch] text-base sm:text-lg text-gray-600 leading-relaxed" style={{ textWrap: "pretty" } as React.CSSProperties}>{b.text}</p>
                </div>
                <div className={`lg:col-span-7 ${i % 2 === 1 ? "lg:order-1 lg:col-start-1" : ""}`}>
                  <Image
                    src={b.image}
                    width={1280}
                    height={800}
                    alt={b.alt}
                    // Its column from lg; below, the site container's width less its 24 px gutters.
                    sizes="(min-width: 1024px) 640px, calc(100vw - 3rem)"
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
      <section aria-labelledby="trust-heading" className="py-20 sm:py-24">
        <div className={SITE_CONTAINER_CLASS}>
          <h2 id="trust-heading" className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ textWrap: "balance" } as React.CSSProperties}>
            Un outil sur lequel compter
          </h2>
          <dl className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
            <div>
              <dt className="text-lg font-semibold">Gratuit et open source</dt>
              <dd className="mt-2 text-base text-gray-600 leading-relaxed">
                Il n&apos;y a ni abonnement ni version payante. Le code est public (licence AGPL-3.0)
                et l&apos;outil évolue avec les retours des associations qui l&apos;utilisent.
              </dd>
            </div>
            <div>
              <dt className="text-lg font-semibold">Hébergé en France, sans pistage</dt>
              <dd className="mt-2 text-base text-gray-600 leading-relaxed">
                L&apos;application et sa base de données sont hébergées chez OVH, en France. Le site ne
                dépose aucun cookie de pistage, ni analytique ni publicitaire.{" "}
                <Link href="/legal/privacy" className={`text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing} focus-visible:outline-blue-700`}>
                  Politique de confidentialité
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-lg font-semibold">Vos données restent les vôtres</dt>
              <dd className="mt-2 text-base text-gray-600 leading-relaxed">
                Chaque organisation ne voit que ses propres événements et ses bénévoles. Vous pouvez
                exporter à tout moment la liste des membres, le journal d&apos;activité ou l&apos;archive
                complète d&apos;un événement.
              </dd>
            </div>
            <div>
              <dt className="text-lg font-semibold">Pensé pour tout le monde</dt>
              <dd className="mt-2 text-base text-gray-600 leading-relaxed">
                L&apos;inscription comme l&apos;administration s&apos;utilisent au clavier et avec un
                lecteur d&apos;écran, et c&apos;est vérifié à chaque modification.{" "}
                <Link href="/accessibilite" className={`text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing} focus-visible:outline-blue-700`}>
                  Déclaration d&apos;accessibilité
                </Link>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ── FAQ (same text as the FAQPage structured data) ───────────────── */}
      <section aria-labelledby="faq-heading" className="bg-gray-50 border-t border-gray-200 py-20 sm:py-24">
        {/* The questions keep a reading measure, on the container's left edge like every heading. */}
        <div className={SITE_CONTAINER_CLASS}>
          <div className="max-w-3xl">
            <h2 id="faq-heading" className="text-3xl sm:text-4xl font-bold tracking-tight">Questions fréquentes</h2>
            <div className="mt-10 divide-y divide-gray-200 border-y border-gray-200">
              {LANDING_FAQ.map((f) => (
                <details key={f.question} className="group">
                  <summary className={`flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-semibold rounded [&::-webkit-details-marker]:hidden ${focusRing} focus-visible:outline-blue-700`}>
                    {f.question}
                    <span aria-hidden="true" className="text-2xl font-normal text-blue-700 transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
                  </summary>
                  <div className="pb-6 pr-8 text-base text-gray-600 leading-relaxed">
                    <p className="max-w-[70ch]">{f.answer}</p>
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
          <p className="mt-8 text-base text-gray-600 leading-relaxed">
            D&apos;autres questions avant de choisir ?{" "}
            <Link href="/logiciel-planning-benevoles" className={`font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing} focus-visible:outline-blue-700`}>
              Logiciel de planning pour bénévoles : ce qu&apos;il fait et les questions fréquentes
            </Link>
          </p>
        </div>
      </section>

      {/* ── CTA bas ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="cta-heading" className="bg-blue-900 py-20">
        <div className={SITE_CONTAINER_CLASS}>
          <div className="max-w-2xl mx-auto text-center">
            <h2 id="cta-heading" className="text-3xl sm:text-4xl font-bold text-white tracking-tight" style={{ textWrap: "balance" } as React.CSSProperties}>
              Votre prochain événement commence ici
            </h2>
            <p className="mt-4 text-lg text-blue-100 leading-relaxed">
              Votre espace est prêt dès que vous avez confirmé votre adresse email, avec une liste de
              premiers pas pour vous guider. La publication, elle, attend une courte vérification.
            </p>
            <Link
              href="/inscription"
              className={`mt-8 inline-flex items-center gap-2 bg-white text-blue-900 text-base font-bold px-7 py-3.5 rounded-full hover:bg-blue-50 transition-colors ${focusRing} focus-visible:outline-white`}
            >
              Demander un espace<span aria-hidden="true"> →</span>
            </Link>
            {CONTACT_EMAIL && (
              <p className="mt-4 text-base text-blue-100">
                Une question avant ?{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className={`text-white font-semibold underline underline-offset-4 decoration-blue-300 hover:decoration-white rounded ${focusRing} focus-visible:outline-white`}>{CONTACT_EMAIL}</a>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* The `site` footer (help, sign-in, support appeal) on benevol.app's own pages only (this
          page and ContentShell), not on the org-subdomain events list above or any
          volunteer-facing page: those are seen by someone else's audience, registering for
          someone else's event, not benevol.app's own. */}
    </main>
      <div className={SITE_CONTAINER_CLASS}><PublicFooter variant="site" /></div>
    </>
  )
}
