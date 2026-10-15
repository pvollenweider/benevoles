// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { lifecycleNotes, noteText, type LifecycleFacts } from "@/lib/event-lifecycle"

const linkClass =
  "underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * What the event's current stage (#371) still needs, with where to do it, and what it concretely
 * means for volunteers. The stage itself is the badge of the event header. Server component.
 */
export default function EventLifecycleBar({ facts, eventId }: { facts: LifecycleFacts; eventId: string }) {
  const notes = lifecycleNotes(facts, eventId)
  return (
    <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 text-sm bg-white border border-gray-200 rounded-xl px-4 py-3">
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
  )
}
