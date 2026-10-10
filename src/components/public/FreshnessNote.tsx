// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { freshness, freshnessDate, type FreshnessDates } from "@/lib/freshness"
import FreshnessBadge from "./FreshnessBadge"

const longDate = (d: Date) => d.toLocaleDateString("fr-CH", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })

/**
 * Under the title of a unit or a video page (#763): the label, then the sentence with its date,
 * « Fiche ajoutée le 7 octobre 2026. » Nothing once the label has expired. `subject` is a feminine
 * noun (« Fiche », « Vidéo »): the participle agrees with it.
 */
export default function FreshnessNote({ dates, subject, now = new Date(), className = "" }: { dates: FreshnessDates | undefined; subject: "Fiche" | "Vidéo"; now?: Date; className?: string }) {
  const kind = freshness(dates ?? {}, now)
  if (!kind) return null
  const date = freshnessDate(dates ?? {}, kind)!
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-700 dark:text-gray-300 ${className}`}>
      <FreshnessBadge kind={kind} />
      <span>
        <span className="sr-only">,</span>{" "}
        {subject} {kind === "new" ? "ajoutée" : "mise à jour"} le <time dateTime={date.toISOString().slice(0, 10)}>{longDate(date)}</time>.
      </span>
    </p>
  )
}
