// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Pauses et charge » on the personal page (#1171): the limits of a protected event that this
 * person's own programme no longer respects (after a cancellation or a change of hours, say).
 * Nothing is refused here, so amber, not red; it says what to do. Shown only with findings.
 */
export default function MyWorkloadCard({ messages, contactEmail }: { messages: string[]; contactEmail: string | null }) {
  if (messages.length === 0) return null
  return (
    <section aria-labelledby="my-workload-title" className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-sm text-amber-950 space-y-2" data-my-workload="1">
      <h2 id="my-workload-title" className="text-sm font-semibold text-gray-900">Pauses et charge</h2>
      <p>Ton programme ne respecte plus les limites de pauses et de charge de cet événement :</p>
      <ul role="list" className="list-disc pl-5 space-y-0.5">
        {messages.map((m) => <li key={m}>{m}</li>)}
      </ul>
      <p>
        Tant que c&apos;est le cas, tu ne peux pas ajouter de créneau qui aggrave la situation. Tu peux retirer un créneau ci-dessous, ou{" "}
        {contactEmail
          ? <a href={`mailto:${contactEmail}`} className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">écrire à l&apos;organisation</a>
          : "en parler à l'organisation"}
        {" "}pour trouver un autre arrangement.
      </p>
    </section>
  )
}
