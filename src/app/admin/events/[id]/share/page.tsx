// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { eventPublicUrl } from "@/lib/urls"
import { isUnlistedPublic, UNLISTED_HINT, visibilityLabel } from "@/lib/event-visibility"
import { liveRoleNames, loadAdminGroupLinks } from "@/lib/group-links-data"
import EventShareLink from "@/components/admin/EventShareLink"
import GroupLinksManager from "@/components/admin/GroupLinksManager"
import HelpLink from "@/components/admin/HelpLink"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Liens à partager" }

const linkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * « Partage »: the public link, the links per group (#947) and the code to embed the sign-up in a
 * site. The QR code, the information pages and the volunteer preview are the other pages of the tab.
 */
export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx
  const { id } = await params

  const event = await db.event.findFirst({
    where: { id },
    select: { id: true, slug: true, title: true, publicStatus: true, isListed: true, organization: { select: { slug: true } } },
  })
  if (!event) notFound()

  const published = event.publicStatus === "published"
  const archived = event.publicStatus === "archived"
  const publicUrl = eventPublicUrl(event.organization.slug, event.slug)
  // The links per group can be prepared before publishing.
  const [groupLinks, roles] = archived ? [[], []] : await Promise.all([loadAdminGroupLinks(db, event), liveRoleNames(db, event.id)])

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">Liens à partager</h1>
        <HelpLink route="/admin/events/[id]/share" />
      </div>

      {isUnlistedPublic(event) && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
          <strong>{visibilityLabel(event)}.</strong> {UNLISTED_HINT} L&apos;événement n&apos;apparaît pas sur la page publique de l&apos;organisation ; partagez son lien ou son QR code.
        </p>
      )}

      {archived ? (
        <p className="text-sm text-gray-800">L&apos;événement est archivé : sa page d&apos;inscription est fermée et ses liens ne mènent plus nulle part.</p>
      ) : (
        <>
          <section aria-labelledby="share-link" className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h2 id="share-link" className="text-base font-semibold text-gray-900">Lien de l&apos;événement</h2>
            {published ? (
              <>
                <EventShareLink url={publicUrl} />
                <p className="text-sm">
                  <a href={publicUrl} target="_blank" rel="noopener" className={linkClass}>
                    Ouvrir la page publique<span className="sr-only"> (ouvre dans un nouvel onglet)</span>
                    <span aria-hidden="true" className="ml-1 font-normal">↗</span>
                  </a>
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-800">
                Le lien fonctionnera une fois l&apos;événement publié. En attendant,{" "}
                <Link href={`/admin/events/${event.id}/preview`} className={linkClass}>prévisualisez la page comme un bénévole</Link>.
              </p>
            )}
          </section>

          <section aria-labelledby="share-groups" className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h2 id="share-groups" className="text-base font-semibold text-gray-900">Liens par groupe et intégration</h2>
            <GroupLinksManager
              eventId={event.id}
              roles={roles}
              initialLinks={groupLinks}
              published={published}
              embed={{ publicUrl, eventTitle: event.title, eventSlug: event.slug }}
            />
          </section>
        </>
      )}
    </div>
  )
}
