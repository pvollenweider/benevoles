// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { wizardHrefs, WIZARD_STEPS, type WizardStep } from "@/lib/event-wizard"

/**
 * Step indicator of the three-step event creation (#401). Done steps are links; the assistant can
 * be left at any time for the full interface.
 */
export default function WizardSteps({ current, eventId }: { current: WizardStep; eventId: string | null }) {
  const hrefs = wizardHrefs(eventId)
  return (
    <nav aria-label="Étapes de création de l'événement" className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <ol className="flex items-center gap-2 sm:gap-4 flex-wrap text-sm">
        {WIZARD_STEPS.map((s) => {
          const done = s.n < current
          const isCurrent = s.n === current
          const state = done ? ", faite" : isCurrent ? ", en cours" : ""
          const name = `Étape ${s.n}${state} : ${s.label}`
          const circle = (
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${isCurrent ? "bg-blue-600 text-white" : done ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`} aria-hidden="true">
              {done ? "✓" : s.n}
            </span>
          )
          return (
            <li key={s.n} aria-current={isCurrent ? "step" : undefined} className="flex items-center gap-1.5">
              {done && eventId ? (
                // aria-label rather than an sr-only prefix: name computation drops the space between
                // inline spans, giving « faite :Informations » to screen readers.
                <Link href={hrefs[s.n]} aria-label={name} className="flex items-center gap-1.5 rounded hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                  {circle}
                  <span className="text-gray-700">{s.label}</span>
                </Link>
              ) : (
                <span className="flex items-center gap-1.5">
                  {circle}
                  <span className={isCurrent ? "font-semibold text-gray-900" : "text-gray-700"}>
                    <span className="sr-only">Étape {s.n}{state} : </span>{s.label}
                  </span>
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <Link href={hrefs.exit} className="text-sm text-gray-700 underline underline-offset-2 hover:text-gray-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        Quitter l&apos;assistant
      </Link>
    </nav>
  )
}
