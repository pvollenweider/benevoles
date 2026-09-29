// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { lifecycleNotes, lifecycleSteps, noteText, type LifecycleFacts } from "@/lib/event-lifecycle"

const linkClass =
  "underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * Where the event stands (#371): the five stages as a progress list, then what the current stage
 * still needs and what it concretely means for volunteers. Server component, pure data.
 */
export default function EventLifecycleBar({ facts, eventId }: { facts: LifecycleFacts; eventId: string }) {
  const steps = lifecycleSteps(facts)
  const notes = lifecycleNotes(facts, eventId)
  return (
    <section aria-labelledby="lifecycle-title" className="bg-white border border-gray-200 rounded-xl px-4 py-3 space-y-3">
      <h2 id="lifecycle-title" className="sr-only">Étape de l&apos;événement</h2>
      {/* role="list": Safari/VoiceOver drops list semantics once Tailwind removes the markers. */}
      <ol role="list" className="flex items-center gap-2 sm:gap-4 flex-wrap text-sm">
        {steps.map((s, i) => {
          const state = s.state === "done" ? ", passée" : s.state === "current" ? ", en cours" : ""
          return (
            <li key={s.id} aria-current={s.state === "current" ? "step" : undefined} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                  s.state === "current" ? "bg-blue-600 text-white" : s.state === "done" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
                }`}
              >
                {s.state === "done" ? "✓" : i + 1}
              </span>
              {/* One hidden text node with the whole phrase: nothing for a screen reader to concatenate. */}
              <span className="sr-only">Étape {i + 1}{state} : {s.label}</span>
              <span aria-hidden="true" className={s.state === "current" ? "font-semibold text-gray-900" : "text-gray-700"}>{s.label}</span>
            </li>
          )
        })}
      </ol>
      <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 text-sm">
        {notes.needs.length > 0 && (
          <div>
            <h3 className="font-medium text-gray-900">À faire</h3>
            <ul className="mt-1 space-y-1 list-disc pl-5 text-gray-800">
              {notes.needs.map((n) => (
                <li key={noteText(n)}>
                  {n.before}
                  {n.action && <Link href={n.action.href} className={`text-blue-700 ${linkClass}`}>{n.action.label}</Link>}
                  {n.after}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h3 className="font-medium text-gray-900">Concrètement</h3>
          <ul className="mt-1 space-y-1 list-disc pl-5 text-gray-800">
            {notes.consequences.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      </div>
    </section>
  )
}
