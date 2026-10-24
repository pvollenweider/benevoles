// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

"use client"

import { useEffect, useRef } from "react"
import { ORG_UNAVAILABLE_TITLE, orgUnavailableCopy } from "@/lib/org-lifecycle"

const LINK_CLASS = "text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

type Props = { audience: "volunteer" | "leader"; /** The instance's contact address; none, no contact line. */ contact: string | null }

/** The text and the contact line, also shown inside the waitlist offer page's own card. */
export function OrgUnavailableText({ audience, contact }: Props) {
  const copy = orgUnavailableCopy(audience)
  return (
    <>
      <p className={`text-sm text-gray-700${contact ? " mb-3" : ""}`}>{copy.text}</p>
      {contact && (
        <p className="text-sm text-gray-700">
          {copy.contactIntro} <a href={`mailto:${contact}`} className={LINK_CLASS}>{contact}</a>{" "}: {copy.contactOutro}
        </p>
      )}
    </>
  )
}

/**
 * What a volunteer's or a sector leader's link shows while its organisation is deactivated or
 * suspended (src/lib/org-lifecycle.ts): nothing of the link's content, the same page in both cases,
 * and where to ask about one's personal data. No link back to the organisation: its pages are closed.
 */
export default function OrgUnavailableNotice({ audience, contact, focusHeading = false }: Props & {
  /** Shown in place of a page already in use (an action refused): focus moves to the heading. */
  focusHeading?: boolean
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    document.title = `${ORG_UNAVAILABLE_TITLE} — Bénévoles`
    if (focusHeading) headingRef.current?.focus()
  }, [focusHeading])
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <h1 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-gray-900 mb-2 outline-none">{ORG_UNAVAILABLE_TITLE}</h1>
        <OrgUnavailableText audience={audience} contact={contact} />
      </div>
    </main>
  )
}
