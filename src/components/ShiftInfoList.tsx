// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { shiftInfoLines, type ShiftInfo } from "@/lib/shift-info"

/**
 * Place, contact and instructions of a shift (#397), as a description list. Renders nothing
 * when the shift has no practical info. A phone number is a link, so it can be tapped.
 */
export default function ShiftInfoList({ info, className = "" }: { info: ShiftInfo; className?: string }) {
  const lines = shiftInfoLines(info)
  if (lines.length === 0) return null
  const phone = (info.contactPhone ?? "").trim()
  return (
    <dl className={`space-y-0.5 ${className}`}>
      {lines.map((l) => (
        <div key={l.kind} className="flex gap-1">
          <dt className="font-medium shrink-0">{l.label} :</dt>
          <dd className="min-w-0 break-words">
            {l.kind === "contact" && phone ? (
              <>
                {(info.contactName ?? "").trim() && <>{(info.contactName ?? "").trim()} · </>}
                <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} aria-label={`Appeler ${(info.contactName ?? "").trim() ? `${(info.contactName ?? "").trim()} au ` : ""}${phone}`} className="underline underline-offset-2">{phone}</a>
              </>
            ) : l.text}
          </dd>
        </div>
      ))}
    </dl>
  )
}
