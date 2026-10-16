import { describe, it, expect } from "vitest"
import { formatScheduledFor, isDue, localNow, scheduledInstant, scheduledStateLabel, scheduleProblem, scheduleSchema, skipReason, SCHEDULE_STALE_CLAIM_MS } from "../scheduled-message"

// Scheduled targeted messages (#1019): the date and time rule, the due selection, the skip reasons.

const ZONE = "Europe/Zurich"
// Friday 16 October 2026, 10:30 in Zurich (summer time, UTC+2).
const NOW = new Date("2026-10-16T08:30:00Z")

describe("localNow / scheduledInstant", () => {
  it("reads and builds local wall-clock times of the organisation's zone", () => {
    expect(localNow(NOW, ZONE)).toEqual({ date: "2026-10-16", time: "10:30" })
    expect(localNow(NOW, "America/New_York")).toEqual({ date: "2026-10-16", time: "04:30" })
    expect(scheduledInstant("2026-10-16", "18:00", ZONE).toISOString()).toBe("2026-10-16T16:00:00.000Z")
    // After the change to winter time (25 October): UTC+1.
    expect(scheduledInstant("2026-10-26", "18:00", ZONE).toISOString()).toBe("2026-10-26T17:00:00.000Z")
  })
})

describe("scheduleProblem", () => {
  it("accepts a time later today or another day ahead", () => {
    expect(scheduleProblem({ date: "2026-10-16", time: "10:31" }, ZONE, NOW)).toBeNull()
    expect(scheduleProblem({ date: "2026-12-24", time: "08:00" }, ZONE, NOW)).toBeNull()
  })

  it("asks for the missing date, then the missing time", () => {
    expect(scheduleProblem({ date: "", time: "" }, ZONE, NOW)).toEqual({ field: "date", message: "Indiquez la date d'envoi." })
    expect(scheduleProblem({ date: "2026-10-17", time: "" }, ZONE, NOW)).toEqual({ field: "time", message: "Indiquez l'heure d'envoi." })
    expect(scheduleProblem({ date: "2026-10-17", time: "25:00" }, ZONE, NOW)?.field).toBe("time")
  })

  it("refuses a past day on the date, an earlier hour today on the time, with the current time", () => {
    expect(scheduleProblem({ date: "2026-10-15", time: "23:00" }, ZONE, NOW)).toEqual({ field: "date", message: "Cette date est passée : choisissez aujourd'hui ou un jour à venir." })
    expect(scheduleProblem({ date: "2026-10-16", time: "10:30" }, ZONE, NOW)).toEqual({ field: "time", message: "Cette heure est passée : choisissez une heure après 10:30 (heure de Europe/Zurich)." })
    expect(scheduleProblem({ date: "2026-10-16", time: "09:00" }, ZONE, NOW)?.field).toBe("time")
  })

  it("refuses more than a year ahead", () => {
    expect(scheduleProblem({ date: "2027-10-17", time: "10:00" }, ZONE, NOW)).toEqual({ field: "date", message: "Programmez l'envoi au plus 365 jours à l'avance." })
  })

  it("follows the organisation's zone, not the server's", () => {
    // 10:00 in New York is 16:00 in Zurich: still ahead at 10:30 Zurich time.
    expect(scheduleProblem({ date: "2026-10-16", time: "10:00" }, "America/New_York", NOW)).toBeNull()
    expect(scheduleProblem({ date: "2026-10-16", time: "10:00" }, ZONE, NOW)).not.toBeNull()
  })
})

describe("scheduleSchema", () => {
  it("takes the message fields plus a date and a time, never a dry run", () => {
    const ok = scheduleSchema.safeParse({ audience: { kind: "event" }, subject: "S", message: "M", date: "2026-10-17", time: "18:00", dryRun: true })
    expect(ok.success && "dryRun" in ok.data).toBe(false)
    expect(scheduleSchema.safeParse({ audience: { kind: "event" }, subject: "S", message: "M", date: "17.10.2026", time: "18:00" }).success).toBe(false)
  })
})

describe("formatScheduledFor", () => {
  it("names the day and the time in the zone, the year only when it is not this one", () => {
    expect(formatScheduledFor(new Date("2026-10-20T16:00:00Z"), ZONE, NOW)).toBe("mardi 20 octobre à 18:00")
    expect(formatScheduledFor(new Date("2027-01-05T08:00:00Z"), ZONE, NOW)).toBe("mardi 5 janvier 2027 à 09:00")
  })
})

describe("isDue", () => {
  const at = (iso: string) => new Date(iso)
  it("picks scheduled rows whose time has come, and abandoned claims only", () => {
    expect(isDue({ status: "scheduled", scheduledFor: at("2026-10-16T08:30:00Z"), claimedAt: null }, NOW)).toBe(true)
    expect(isDue({ status: "scheduled", scheduledFor: at("2026-10-16T08:31:00Z"), claimedAt: null }, NOW)).toBe(false)
    expect(isDue({ status: "sending", scheduledFor: at("2026-10-16T08:00:00Z"), claimedAt: new Date(NOW.getTime() - 60_000) }, NOW)).toBe(false)
    expect(isDue({ status: "sending", scheduledFor: at("2026-10-16T08:00:00Z"), claimedAt: new Date(NOW.getTime() - SCHEDULE_STALE_CLAIM_MS - 1) }, NOW)).toBe(true)
    for (const status of ["sent", "cancelled", "skipped"]) {
      expect(isDue({ status, scheduledFor: at("2026-10-16T08:00:00Z"), claimedAt: null }, NOW)).toBe(false)
    }
  })
})

describe("skipReason", () => {
  const base = { eventStatus: "published", audience: { kind: "event" as const }, shiftAvailable: true, recipients: 4 }
  it("sends when the event is live and someone is in the audience, draft included", () => {
    expect(skipReason(base)).toBeNull()
    expect(skipReason({ ...base, eventStatus: "draft" })).toBeNull()
  })
  it("never sends on an archived event, a gone shift or an empty audience, with the reason", () => {
    expect(skipReason({ ...base, eventStatus: "archived" })).toBe("l'événement est archivé")
    expect(skipReason({ ...base, audience: { kind: "shift", shiftId: "s1" }, shiftAvailable: false })).toBe("le créneau choisi a été supprimé ou annulé")
    expect(skipReason({ ...base, recipients: 0 })).toBe("personne à qui écrire dans cette sélection au moment de l'envoi")
  })
})

describe("scheduledStateLabel", () => {
  const fmt = () => "lundi 19 octobre à 10:00"
  it("says the state in words", () => {
    const row = { status: "scheduled", skipReason: null, cancelledAt: null, cancelledByName: null }
    expect(scheduledStateLabel(row, fmt)).toBe("Programmé, pas encore parti")
    expect(scheduledStateLabel({ ...row, status: "cancelled", cancelledAt: NOW, cancelledByName: "Léa" }, fmt)).toBe("Annulé le lundi 19 octobre à 10:00, par Léa")
    expect(scheduledStateLabel({ ...row, status: "skipped", skipReason: "l'événement est archivé" }, fmt)).toBe("Non envoyé : l'événement est archivé")
  })
})
