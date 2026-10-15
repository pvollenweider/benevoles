// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { canPublish } from "@/lib/event-wizard"
import { loadReviewChecks } from "@/lib/review-checks-data"
import { acceptsRegistrations } from "@/lib/registration-window"
import { eventPublicUrl } from "@/lib/urls"
import WizardSteps from "@/components/admin/WizardSteps"
import PublishToggle from "@/components/admin/PublishToggle"
import { canPublish as orgCanPublish } from "@/lib/org-approval"
import EventShareLink from "@/components/admin/EventShareLink"
import HelpLink from "@/components/admin/HelpLink"
import ReviewChecklist from "@/components/admin/ReviewChecklist"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Vérifier avant publication" }

const linkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/** Step 3 of the event creation (#401): what's set, what's missing, then publish or stay a draft. */
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params

  const now = new Date()
  const loaded = await loadReviewChecks(ctx.db, id, now)
  if (!loaded) notFound()
  const { event, checks } = loaded
  const ready = canPublish(checks)
  const published = event.publicStatus === "published"
  const publicUrl = eventPublicUrl(event.organization.slug, event.slug)

  return (
    <div className="space-y-6 max-w-2xl">
      <WizardSteps current={3} eventId={event.id} />
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">Vérifier avant publication</h1>
        <HelpLink route="/admin/events/[id]/review" />
        <p role="status" className="text-sm text-gray-700 mt-1">
          {published
            ? acceptsRegistrations(event, now)
              ? "L'événement est publié : les bénévoles peuvent s'inscrire."
              : "L'événement est publié, mais les inscriptions ne sont pas ouvertes : voir la vérification ci-dessous."
            : "Dernier coup d'œil avant d'ouvrir les inscriptions. Tout reste modifiable après la publication."}
        </p>
      </div>

      <section aria-labelledby="review-checks" className="space-y-2">
        <h2 id="review-checks" className="text-base font-semibold text-gray-900">Vérification</h2>
        <ReviewChecklist checks={checks} />
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
            <EventShareLink url={publicUrl} />
            <div className="flex flex-wrap gap-3 items-center">
              <Link href={`/admin/events/${event.id}/share`} className={linkClass}>Liens par groupe et intégration</Link>
              <Link href={`/admin/events/${event.id}/qr`} className={linkClass}>QR code</Link>
              <Link href={`/admin/events/${event.id}/invitations`} className={linkClass}>Inviter des membres</Link>
              <Link href={`/admin/events/${event.id}`} className={linkClass}>Aperçu de l&apos;événement</Link>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-700">
              {ready
                ? "Publier rend la page d'inscription accessible à qui a le lien. Rien n'est envoyé aux membres tant que vous ne les invitez pas."
                : "Complétez les points marqués d'un ! (« À faire ») avant de publier."}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {ready ? <PublishToggle eventId={event.id} currentStatus={event.publicStatus} awaitingValidation={!orgCanPublish(event.organization)} /> : null}
              <Link href={`/admin/events/${event.id}`} className={linkClass}>Rester en brouillon pour l&apos;instant</Link>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
