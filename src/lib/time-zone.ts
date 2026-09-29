// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Time zone of the events (#308). Shift dates and times are local wall-clock values (a
 * `Shift.date` at midnight UTC for the calendar day + a "HH:MM" `startTime`), while servers run
 * in UTC: turning them into real instants, or formatting instants for people, must go through
 * this zone, or everything is off by 1 h in winter and 2 h in summer for Swiss events.
 *
 * Each organization can set its own zone (`Organization.timeZone`, #344); APP_TIME_ZONE (IANA
 * name, default Europe/Zurich) is the default for organizations that haven't.
 */
export function appTimeZone(env: Record<string, string | undefined> = process.env): string {
  return env.APP_TIME_ZONE?.trim() || "Europe/Zurich"
}

export const APP_TIME_ZONE = appTimeZone()

/**
 * Throws unless `timeZone` is an IANA name this runtime knows (#343). Checked at startup: an
 * invalid value would otherwise only fail on the first date formatted (reminders cron, emails,
 * PDF export, event log), long after the deploy looked healthy.
 */
export function assertTimeZone(timeZone: string): void {
  if (!isValidTimeZone(timeZone)) {
    throw new Error(
      `APP_TIME_ZONE "${timeZone}" is not a valid IANA time zone (e.g. "Europe/Zurich"). See README, variables d'environnement.`,
    )
  }
}

/** Whether `timeZone` is an IANA name this runtime knows ("Europe/Zurich", "UTC"). */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false
  try {
    new Intl.DateTimeFormat("en", { timeZone })
    return true
  } catch {
    return false
  }
}

/**
 * Time zone of an organization's events (#344): its own setting, or the deployment default
 * (APP_TIME_ZONE) when unset. A stored value this runtime doesn't know falls back to the default
 * rather than making every date of the organization throw.
 */
export function orgTimeZone(org?: { timeZone?: string | null } | null): string {
  const tz = org?.timeZone?.trim()
  return tz && isValidTimeZone(tz) ? tz : APP_TIME_ZONE
}

/** Zones offered in the settings: every IANA zone this runtime knows, plus `current` if it's missing. */
export function timeZoneChoices(current?: string | null): string[] {
  const all = Intl.supportedValuesOf("timeZone")
  return current && !all.includes(current) ? [...all, current].sort() : all
}

/** Offset (ms) of `timeZone` from UTC at `instant`: local wall time minus UTC. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  return asUtc - (instant - (instant % 1000))
}

/**
 * The real instant of a local wall-clock time: calendar day of `date` (its UTC Y/M/D, as
 * stored) at `hhmm`. Hours may exceed 23 for shifts running past midnight ("26:00" = 02:00 the
 * next day). In the non-existent hour of a spring-forward change the result lands one hour
 * later; in the repeated hour of a fall-back change, the second occurrence (standard time) is used.
 */
export function localDateTimeToUtc(date: Date, hhmm: string, timeZone: string = APP_TIME_ZONE): Date {
  const [h, m] = hhmm.split(":").map(Number)
  const naive = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h || 0, m || 0)
  // Two passes: the offset depends on the instant we're looking for.
  const first = naive - zoneOffsetMs(naive, timeZone)
  return new Date(naive - zoneOffsetMs(first, timeZone))
}
