// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { MessageHistoryItem } from "@/lib/message-history-data"
import { deliveryLabel } from "@/lib/message-history"
import ResendFailedButton from "./ResendFailedButton"

// The year only when it isn't this one (messages are kept 12 months).
const when = (d: Date, timeZone: string) =>
  d.toLocaleString("fr-FR", {
    timeZone, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  })

/**
 * « Messages envoyés » (#467): each targeted message of the event, newest first — when, by whom,
 * to whom and how many, the text sent, and how it was delivered, in words.
 */
export default function MessageHistory({ eventId, items, timeZone }: { eventId: string; items: MessageHistoryItem[]; timeZone: string }) {
  return (
    <section aria-labelledby="message-history-heading" className="space-y-3">
      <h2 id="message-history-heading" className="text-lg font-semibold text-gray-900">Messages envoyés</h2>
      {items.length === 0 ? (
        <p className="text-sm text-gray-700">Aucun message envoyé pour cet événement.</p>
      ) : (
        <ol role="list" className="space-y-3">
          {items.map((m) => (
            <li key={m.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <article aria-labelledby={`msg-${m.id}`}>
                <h3 id={`msg-${m.id}`} className="font-medium text-gray-900 break-words">{m.subject}</h3>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-gray-600">Envoyé</dt>
                  <dd className="text-gray-900">le <time dateTime={m.createdAt.toISOString()}>{when(m.createdAt, timeZone)}</time>, par {m.authorName}</dd>
                  <dt className="text-gray-600">À</dt>
                  <dd className="text-gray-900">{m.audienceLabel}, {m.recipientCount} personne{m.recipientCount > 1 ? "s" : ""}</dd>
                  <dt className="text-gray-600">Remise</dt>
                  <dd className={m.delivery.failed > 0 ? "font-medium text-red-800" : "text-gray-900"}>
                    {deliveryLabel(m.delivery)}
                    {m.delivery.failed > m.retryable && (
                      <span className="block font-normal text-gray-700">
                        {m.retryable === 0 ? "Ces échecs datent de plus de 30 jours : ils ne peuvent plus être renvoyés." : `${m.delivery.failed - m.retryable} de plus de 30 jours ne peuvent plus être renvoyés.`}
                      </span>
                    )}
                  </dd>
                </dl>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                    Voir le texte envoyé<span className="sr-only"> : « {m.subject} »</span>
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 text-sm text-gray-800">{m.message}</p>
                </details>
                {m.retryable > 0 && (
                  <div className="mt-2">
                    <ResendFailedButton eventId={eventId} messageId={m.id} count={m.retryable} subject={m.subject} />
                  </div>
                )}
              </article>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-gray-600">Les messages sont conservés 12 mois. Les destinataires ne sont pas listés, seulement leur nombre. Les emails automatiques (confirmations, rappels) n&apos;apparaissent pas ici.</p>
    </section>
  )
}
