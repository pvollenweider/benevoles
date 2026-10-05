// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { fmtRange } from "@/lib/gantt-utils"
import { MISSION_BRIEF_ID, MISSION_BRIEF_TITLE, missionBrief, orgContactHref, type BriefEvent, type BriefShift } from "@/lib/mission-brief"
import { ORG_CONTACT_LABEL, sectorLeaderLabel } from "@/lib/shift-info"
import PhoneLink from "@/components/PhoneLink"
import MapLink from "@/components/MapLink"
import EmergencyNote from "@/components/EmergencyNote"

const linkCls = "text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * « Avant ta mission » (#560), at the top of the personal page: the next confirmed shift, when
 * and where, whom to contact on site, the instruction, then the event's information pages and
 * the organization's email. Each line only when there is something to say.
 */
export default function MissionBriefCard({ shift, event, eventTitle, contactEmail }: {
  shift: BriefShift
  event: BriefEvent
  eventTitle: string
  contactEmail: string | null
}) {
  const brief = missionBrief(shift, event)
  // Shift dates are calendar days at midnight UTC: read them in UTC, whatever the visitor's zone.
  const date = new Date(shift.date).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
  return (
    <section id={MISSION_BRIEF_ID} aria-labelledby="mission-brief-title" className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <h2 id="mission-brief-title" className="text-base font-semibold text-gray-900">{MISSION_BRIEF_TITLE}</h2>
        <p className="text-sm font-medium text-gray-900 mt-0.5 break-words">{shift.label}</p>
      </div>
      <dl className="space-y-2 text-sm text-gray-800">
        <div>
          <dt className="font-medium text-gray-900">Quand</dt>
          <dd>{date}, {fmtRange(shift.startTime, shift.endTime)}</dd>
        </div>
        {brief.place && (
          <div>
            <dt className="font-medium text-gray-900">Lieu</dt>
            <dd className="break-words">
              {brief.place.text}
              {brief.place.href && (
                <>
                  {" "}
                  <MapLink href={brief.place.href} place={brief.place.text} className="text-blue-700 hover:text-blue-900" />
                </>
              )}
            </dd>
          </div>
        )}
        {brief.contact && (
          <div>
            <dt className="font-medium text-gray-900">{brief.contact.label}</dt>
            <dd className="break-words">
              {brief.contact.name}
              {brief.contact.name && brief.contact.phone && ", "}
              {brief.contact.phone && <PhoneLink name={brief.contact.name} phone={brief.contact.phone} />}
              {brief.contact.kind === "day" && <EmergencyNote className="mt-1" />}
            </dd>
          </div>
        )}
        {brief.leaders.length > 0 && (
          <div>
            <dt className="font-medium text-gray-900">{sectorLeaderLabel(brief.leaders.length)}</dt>
            <dd className="break-words">{brief.leaders.join(", ")}</dd>
          </div>
        )}
        {brief.instructions && (
          <div>
            <dt className="font-medium text-gray-900">À savoir</dt>
            <dd className="whitespace-pre-line break-words">{brief.instructions}</dd>
          </div>
        )}
      </dl>
      {brief.pages.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Infos de l&apos;événement</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {brief.pages.map((p) => (
              <li key={p.url}><a href={p.url} className={linkCls}>{p.title}</a></li>
            ))}
          </ul>
        </div>
      )}
      {contactEmail && (
        <p className="text-sm">
          <a href={orgContactHref(contactEmail, eventTitle)} className={linkCls}>{ORG_CONTACT_LABEL}</a>
        </p>
      )}
    </section>
  )
}
