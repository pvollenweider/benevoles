// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import FocusTargetHeading from "@/components/admin/event-nav/FocusTargetHeading"
import { SEND_BATCH_LIST_LIMIT, type SendBatchView } from "@/lib/send-batches-data"
import { recipientsText, SEND_BATCHES_ANCHOR } from "@/lib/send-batches"

const LINK = "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

// The year only when it isn't this one (batches are kept three years).
const when = (d: Date, timeZone: string) =>
  d.toLocaleString("fr-FR", {
    timeZone, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  })
// « 22 octobre à 21:04 »: tells two batches of the same kind apart, in headings and link names.
const short = (d: Date, timeZone: string) =>
  `${d.toLocaleDateString("fr-FR", { timeZone, day: "numeric", month: "long" })} à ${d.toLocaleTimeString("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" })}`

/**
 * « Envois groupés » (#1101): each batch of emails sent at once from the event, newest first — what
 * it was, when, by whom, to how many, and what became of it, in words. Never who received it.
 * `messageIds`: the messages listed in « Messages envoyés » on the same page, the only ones a
 * « Voir le message » link may point to.
 */
export default function SendBatchList({ items, timeZone, messageIds }: { items: SendBatchView[]; timeZone: string; messageIds: Set<string> }) {
  return (
    <section aria-labelledby={SEND_BATCHES_ANCHOR} className="space-y-3">
      <FocusTargetHeading id={SEND_BATCHES_ANCHOR} className="text-lg font-semibold text-gray-900">Envois groupés</FocusTargetHeading>
      <p className="text-sm text-gray-700">Chaque envoi à plusieurs personnes depuis cet événement, avec ce qu&apos;il est devenu. Les destinataires ne sont pas listés, seulement leur nombre.</p>
      {items.length === 0 ? (
        <p className="text-sm text-gray-700">Aucun envoi groupé pour cet événement.</p>
      ) : (
        <ol role="list" className="space-y-3">
          {items.map((b) => {
            const name = `${b.kindLabel} du ${short(b.createdAt, timeZone)}`
            const showMessage = b.targetedMessageId !== null && messageIds.has(b.targetedMessageId)
            return (
              <li key={b.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <article aria-labelledby={`batch-${b.id}`}>
                  <h3 id={`batch-${b.id}`} className="font-medium text-gray-900">
                    {b.kindLabel}<span className="sr-only">, {short(b.createdAt, timeZone)}</span>
                  </h3>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-gray-600">Envoyé</dt>
                    <dd className="text-gray-900">le <time dateTime={b.createdAt.toISOString()}>{when(b.createdAt, timeZone)}</time>, par {b.actorLabel}</dd>
                    <dt className="text-gray-600">À</dt>
                    <dd className="text-gray-900">{recipientsText(b.delivery.recipients)}</dd>
                    <dt className="text-gray-600">Remise</dt>
                    <dd className={b.delivery.failed > 0 ? "font-medium text-red-800" : "text-gray-900"}>{b.deliveryLabel}</dd>
                  </dl>
                  {b.heldSentence && <p className="mt-2 text-sm text-gray-700">{b.heldSentence}</p>}
                  {(b.inOutbox > 0 || showMessage) && (
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {b.inOutbox > 0 && (
                        <a href={`/admin/settings/notifications?envoi=${encodeURIComponent(b.id)}#emails-envoyes`} className={LINK}>
                          Voir les emails de cet envoi{b.failedInOutbox > 0 ? ` (dont ${b.failedInOutbox} en échec)` : ""}<span className="sr-only"> : {name}</span>
                        </a>
                      )}
                      {showMessage && (
                        <a href={`#msg-${b.targetedMessageId}`} className={LINK}>
                          Voir le message<span className="sr-only"> : {name}</span>
                        </a>
                      )}
                    </p>
                  )}
                </article>
              </li>
            )
          })}
        </ol>
      )}
      <p className="text-xs text-gray-600">{items.length >= SEND_BATCH_LIST_LIMIT && `Seuls les ${SEND_BATCH_LIST_LIMIT} plus récents sont affichés. `}Les envois groupés sont gardés trois ans, sans les adresses ni le texte des emails. Dans « Emails envoyés », un email parti reste visible jusqu&apos;au nettoyage de la nuit, un email en échec 30 jours.</p>
    </section>
  )
}
