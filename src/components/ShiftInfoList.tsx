// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { onSiteContact, readBeforePages, shiftInfoLines, showsDayContact, type ShiftInfo } from "@/lib/shift-info"
import { READ_BEFORE_LABEL } from "@/lib/event-page-postes"
import PhoneLink from "@/components/PhoneLink"
import MapLink from "@/components/MapLink"
import EmergencyNote from "@/components/EmergencyNote"

/**
 * Place, contact and instructions of a shift (#397), as a description list. Renders nothing
 * when the shift has no practical info. A phone number is a link, so it can be tapped. The
 * event's day-of contact (#560) stands in for a shift without a contact, with the emergency
 * note; the role's sector leaders are named, never with their contact details.
 */
export default function ShiftInfoList({ info, className = "" }: { info: ShiftInfo; className?: string }) {
  const lines = shiftInfoLines(info)
  const pages = readBeforePages(info)
  if (lines.length === 0 && pages.length === 0) return null
  const contact = onSiteContact(info)
  const linkClass = "py-1 inline-block text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 break-words"
  return (
    <div className={className}>
      <dl className="space-y-0.5">
        {lines.map((l) => (
          <div key={l.kind} className="flex flex-wrap gap-x-1">
            <dt className="font-medium">{l.label} :</dt>
            <dd className="min-w-0 break-words">
              {(l.kind === "contact" || l.kind === "dayContact") && contact?.phone ? (
                <>
                  {contact.name && <>{contact.name}, </>}
                  <PhoneLink name={contact.name} phone={contact.phone} />
                </>
              ) : l.href ? (
                <>
                  {l.text}{" "}
                  <MapLink href={l.href} place={l.text} />
                </>
              ) : l.text}
            </dd>
          </div>
        ))}
      </dl>
      {/* The pages attached to the shift's poste (#1324), after the practical info as a <p>, never
          a dt/dd: one link per page, its whole sentence inside the anchor. */}
      {pages.length === 1 ? (
        <p className="mt-1">
          <a href={pages[0].url} className={linkClass}>{READ_BEFORE_LABEL} : {pages[0].title}</a>
        </p>
      ) : pages.length > 1 ? (
        <ul className="mt-1 space-y-0.5">
          {pages.map((p) => (
            <li key={p.url}><a href={p.url} className={linkClass}>{READ_BEFORE_LABEL} : {p.title}</a></li>
          ))}
        </ul>
      ) : null}
      {showsDayContact(lines) && <EmergencyNote className="mt-1" />}
    </div>
  )
}
