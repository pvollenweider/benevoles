// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { onSiteContact, shiftInfoLines, showsDayContact, type ShiftInfo } from "@/lib/shift-info"
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
  if (lines.length === 0) return null
  const contact = onSiteContact(info)
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
      {showsDayContact(lines) && <EmergencyNote className="mt-1" />}
    </div>
  )
}
