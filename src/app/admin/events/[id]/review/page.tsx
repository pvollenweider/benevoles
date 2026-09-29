// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { canPublish, reviewChecks } from "@/lib/event-wizard"
import { eventPublicUrl } from "@/lib/urls"
import WizardSteps from "@/components/admin/WizardSteps"
import PublishToggle from "@/components/admin/PublishToggle"

export const dynamic = "force-dynamic"
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const ctx = await getOrgContext()
  const { id } = await params
  const event = ctx ? await ctx.db.event.findFirst({ where: { id }, select: { title: true } }) : null
  return { title: event ? `Vérification et publication – ${event.title}` : "Vérification et publication" }
}

const linkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/** Step 3 of the event creation (#401): what's set, what's missing, then publish or stay a draft. */
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params

  const event = await ctx.db.event.findFirst({
    where: { id },
    select: {
      id: true, title: true, slug: true, startDate: true, endDate: true, location: true, confirmationMessage: true, publicInstructions: true, publicStatus: true,
      organization: { select: { slug: true } },
      shifts: { where: { status: { not: "cancelled" } }, select: { roleName: true, capacity: true } },
      _count: { select: { sectorLeaders: true } },
    },
  })
  if (!event) notFound()

  const checks = reviewChecks({
    id: event.id, title: event.title,
    startDate: event.startDate.toISOString().slice(0, 10), endDate: event.endDate.toISOString().slice(0, 10),
    location: event.location, confirmationMessage: event.confirmationMessage, publicInstructions: event.publicInstructions,
    publicStatus: event.publicStatus,
    shiftCount: event.shifts.length,
    roleCount: new Set(event.shifts.map((s) => s.roleName)).size,
    capacity: event.shifts.reduce((n, s) => n + s.capacity, 0),
    leaderCount: event._count.sectorLeaders,
  })
  const ready = canPublish(checks)
  const published = event.publicStatus === "published"
  const publicUrl = eventPublicUrl(event.organization.slug, event.slug)

  return (
    <div className="space-y-6 max-w-2xl">
      <WizardSteps current={3} eventId={event.id} />
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">{event.title}</h1>
        <p role="status" className="text-sm text-gray-700 mt-1">
          {published
            ? "L'événement est publié : les bénévoles peuvent s'inscrire."
            : "Dernier coup d'œil avant d'ouvrir les inscriptions. Tout reste modifiable après la publication."}
        </p>
      </div>

      <section aria-labelledby="review-checks" className="space-y-2">
        <h2 id="review-checks" className="text-base font-semibold text-gray-900">Vérification</h2>
        {/* role="list": Safari/VoiceOver drops list semantics once Tailwind removes the bullets. */}
        <ul role="list" className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {checks.map((c) => (
            <li key={c.id} className="px-4 py-3 text-sm flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <p className="text-gray-900">
                  <span className="sr-only">{c.ok ? "Fait : " : c.required ? "À faire : " : "Facultatif : "}</span>
                  <span aria-hidden="true" className={`inline-block w-5 ${c.ok ? "text-green-800" : c.required ? "text-red-700" : "text-gray-500"}`}>{c.ok ? "✓" : c.required ? "!" : "–"}</span>
                  {c.label}
                </p>
                {!c.ok && c.hint && <p className="text-xs text-gray-600 pl-5">{c.hint}</p>}
              </div>
              <Link href={c.href} className={linkClass}>
                {c.ok ? "Modifier" : c.required ? "Compléter" : "Ajouter"}
                <span className="sr-only"> : {c.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="review-preview" className="space-y-2">
        <h2 id="review-preview" className="text-base font-semibold text-gray-900">Voir ce que verront les bénévoles</h2>
        <p className="text-sm text-gray-700">
          <Link href={`/admin/events/${event.id}/preview`} className={linkClass}>Prévisualiser comme un bénévole</Link>
          {" "}: la page d&apos;inscription telle qu&apos;ils la verront, et l&apos;email de confirmation qu&apos;ils recevraient, sans rien enregistrer.
        </p>
      </section>

      <section aria-labelledby="review-publish" className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 id="review-publish" className="text-base font-semibold text-gray-900">Publication</h2>
        {published ? (
          <>
            <p className="text-sm text-gray-700">
              Lien à partager : <a href={publicUrl} target="_blank" rel="noopener" className={`${linkClass} break-all`}>{publicUrl}<span className="sr-only"> (ouvre dans un nouvel onglet)</span></a>
            </p>
            <div className="flex flex-wrap gap-3 items-center">
              <Link href={`/admin/events/${event.id}/qr`} className={linkClass}>QR code</Link>
              <Link href={`/admin/events/${event.id}/invitations`} className={linkClass}>Inviter des membres</Link>
              <Link href={`/admin/events/${event.id}`} className={linkClass}>Ouvrir la page de l&apos;événement</Link>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-700">
              {ready
                ? "Publier rend la page d'inscription accessible à qui a le lien. Rien n'est envoyé aux membres tant que vous ne les invitez pas."
                : "Complétez les points marqués « À faire » avant de publier."}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {ready ? <PublishToggle eventId={event.id} currentStatus={event.publicStatus} /> : null}
              <Link href={`/admin/events/${event.id}`} className={linkClass}>Rester en brouillon pour l&apos;instant</Link>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
