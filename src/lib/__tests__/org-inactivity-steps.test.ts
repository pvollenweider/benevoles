import { describe, it, expect } from "vitest"
import {
  BLOCK_AFTER_DAYS, ceilToLocalMidnight, deadlineDay, decideProcedure, FINAL_NOTICE_DAYS, inactivityCopyVerdict,
  MIN_DEACTIVATION_DAYS, nextStepAt, plannedAfterLast, plannedAtQueue, procedureView,
  type ProcedureInput, type StepKey, type StepRow,
} from "../org-inactivity-steps"

// #1114: the three messages are real, in order, and the date announced is the date applied.

const DAY = 86_400_000
const TZ = "Europe/Zurich"
// The nightly cleanup runs at 02:00 UTC; each run's `now` drifts by a few seconds.
const night = (n: number, drift = 0) => new Date(Date.UTC(2027, 5, 1, 2, 0, 0) + n * DAY + drift * 1000)
const notice = night(0)

const step = (key: StepKey, queued: Date, confirmed: Date | null, plannedAt: Date, recipients = 1): StepRow =>
  ({ step: key, queuedAt: queued, confirmedAt: confirmed, recipients, plannedAt })

const input = (over: Partial<ProcedureInput> = {}): ProcedureInput =>
  ({ due: true, noticeAt: notice, steps: [], waiting: 0, plannedAt: null, timeZone: TZ, ...over })

/** Plays the nightly runs from `from` to `to`, confirming each queued step `confirmAfterSec` later. */
function simulate(opts: { nights: number[]; confirmAfterSec?: number | null; drift?: (n: number) => number }) {
  let state = input({ noticeAt: null })
  const log: { night: number; action: string; step?: StepKey; plannedAt?: Date }[] = []
  for (const n of opts.nights) {
    const now = night(n, opts.drift?.(n) ?? 0)
    // Confirm what was queued before tonight.
    state = { ...state, steps: state.steps.map((s) => s.confirmedAt || opts.confirmAfterSec === null ? s : { ...s, confirmedAt: new Date(s.queuedAt.getTime() + (opts.confirmAfterSec ?? 5) * 1000) }) }
    const current = state.steps.at(-1)
    state = { ...state, waiting: current && !current.confirmedAt ? 1 : 0 }
    const d = decideProcedure(state, now)
    if (d.action === "queue") {
      state = {
        ...state,
        noticeAt: state.noticeAt ?? now,
        plannedAt: d.plannedAt,
        steps: [...state.steps, step(d.step, now, null, d.plannedAt)],
      }
      log.push({ night: n, action: "queue", step: d.step, plannedAt: d.plannedAt })
    } else if (d.action === "deactivate") {
      log.push({ night: n, action: "deactivate", plannedAt: d.plannedAt })
      break
    } else if (d.action === "wait" || d.action === "blocked") {
      if (d.plannedAt) state = { ...state, plannedAt: d.plannedAt }
    }
  }
  return { log, state }
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

describe("inactivity procedure, three confirmed messages (#1114)", () => {
  it("goes first, +30, +60, then deactivates after the announced day, which never moves on time", () => {
    // A few seconds' drift each night, earlier or later: the steps still land on nights 30 and 60.
    const { log } = simulate({ nights: range(0, 90), drift: (n) => (n % 2 ? -7 : 3) })
    expect(log.map((l) => [l.night, l.action, l.step])).toEqual([
      [0, "queue", "first"], [30, "queue", "second"], [60, "queue", "last"], [76, "deactivate", undefined],
    ])
    const planned = log.map((l) => l.plannedAt!.toISOString())
    expect(new Set(planned).size).toBe(1)
    // Planned: midnight in Zurich after 15 August 2027, the day the emails give as the last one.
    expect(planned[0]).toBe("2027-08-15T22:00:00.000Z")
    expect(deadlineDay(log[0].plannedAt!).toLocaleDateString("fr-FR", { timeZone: TZ })).toBe("15/08/2027")
    // Never before the first email + 75 days nor before the last confirmation + 15 days.
    expect(log[3].plannedAt!.getTime()).toBeGreaterThanOrEqual(notice.getTime() + MIN_DEACTIVATION_DAYS * DAY)
  })

  it("only delays a step for missed nights, and never skips the second reminder", () => {
    // No run between nights 25 and 64: the second reminder goes on night 64, the last one 30 days after.
    const nights = [...range(0, 25), ...range(64, 130)]
    const { log } = simulate({ nights })
    expect(log.map((l) => [l.night, l.action, l.step])).toEqual([
      [0, "queue", "first"], [64, "queue", "second"], [94, "queue", "last"], [110, "deactivate", undefined],
    ])
    // The date moved later at the late reminder, never earlier, and was applied as announced last.
    const [first, second, last, deact] = log.map((l) => l.plannedAt!.getTime())
    expect(second).toBeGreaterThan(first)
    expect(last).toBe(second)
    expect(deact).toBe(last)
  })

  it("does not deactivate after two messages when the nights between day 60 and 75 are missed", () => {
    const { log } = simulate({ nights: [...range(0, 59), 75, 76, 77, 90, 91, 92] })
    expect(log.map((l) => [l.night, l.action, l.step])).toEqual([
      [0, "queue", "first"], [30, "queue", "second"], [75, "queue", "last"], [91, "deactivate", undefined],
    ])
  })

  it("starts no step before the previous one is confirmed, and blocks when it stays unconfirmed", () => {
    const planned = plannedAtQueue("first", notice, null, null, TZ)
    const queued = input({ steps: [step("first", notice, null, planned)], plannedAt: planned, waiting: 1 })
    // Held by a sending limit: waiting, then blocked after BLOCK_AFTER_DAYS, never the next step.
    expect(decideProcedure(queued, night(1))).toMatchObject({ action: "wait", step: "first", confirmed: false })
    expect(decideProcedure(queued, night(BLOCK_AFTER_DAYS))).toMatchObject({ action: "blocked", step: "first", reason: "held" })
    expect(decideProcedure(queued, night(80))).toMatchObject({ action: "blocked", reason: "held" })
    // Failed for good (or cancelled): no copy left to send.
    expect(decideProcedure({ ...queued, waiting: 0 }, night(1))).toMatchObject({ action: "blocked", reason: "undelivered" })
    // No administrator with an address at all.
    expect(decideProcedure({ ...queued, steps: [step("first", notice, null, planned, 0)] }, night(0))).toMatchObject({ action: "blocked", reason: "no-recipient" })
    // Confirmed late, after being blocked: the procedure resumes from that confirmation.
    const late = new Date(notice.getTime() + 5 * DAY)
    const resumed = input({ steps: [step("first", notice, late, planned)], plannedAt: planned })
    expect(decideProcedure(resumed, night(34))).toMatchObject({ action: "wait", confirmed: true, nextAt: nextStepAt(late) })
    expect(decideProcedure(resumed, night(35))).toMatchObject({ action: "queue", step: "second" })
  })

  it("is confirmed by any one administrator's copy (several administrators, partial delivery)", () => {
    // The step is confirmed by the first copy accepted; other copies failing changes nothing.
    const planned = plannedAtQueue("first", notice, null, null, TZ)
    const one = input({ steps: [step("first", notice, new Date(notice.getTime() + 60_000), planned, 3)], plannedAt: planned, waiting: 0 })
    expect(decideProcedure(one, night(10))).toMatchObject({ action: "wait", confirmed: true })
    expect(decideProcedure(one, night(30))).toMatchObject({ action: "queue", step: "second" })
  })

  it("deactivates only 15 full days after the last reminder actually left, even switched off and on", () => {
    const planned = plannedAtQueue("first", notice, null, null, TZ)
    const steps = [
      step("first", night(0), night(0, 5), planned),
      step("second", night(30), night(30, 5), planned),
    ]
    // `report` for months (no nightly procedure), then `on` again on night 200: the last reminder
    // goes that night, and the deactivation waits 15 full days after its confirmation.
    const back = input({ steps, plannedAt: planned })
    const d = decideProcedure(back, night(200))
    expect(d).toMatchObject({ action: "queue", step: "last" })
    const lastPlanned = (d as { plannedAt: Date }).plannedAt
    const withLast = input({ steps: [...steps, step("last", night(200), night(200, 5), lastPlanned)], plannedAt: lastPlanned })
    expect(decideProcedure(withLast, night(214))).toMatchObject({ action: "wait", confirmed: true })
    expect(decideProcedure(withLast, night(216))).toMatchObject({ action: "deactivate" })
    expect(lastPlanned.getTime()).toBeGreaterThanOrEqual(night(200, 5).getTime() + FINAL_NOTICE_DAYS * DAY)
  })

  it("moves the date later when the last reminder is confirmed late, never earlier", () => {
    const planned = plannedAtQueue("last", night(60), notice, null, TZ)
    // Confirmed two days after being queued (held): 15 full days from then.
    const confirmed = new Date(night(60).getTime() + 2 * DAY + 3_600_000)
    const moved = plannedAfterLast(confirmed, notice, planned, TZ)
    expect(moved.getTime()).toBeGreaterThan(planned.getTime())
    expect(moved.getTime()).toBeGreaterThanOrEqual(confirmed.getTime() + FINAL_NOTICE_DAYS * DAY)
    // An earlier confirmation never brings a stored date forward.
    expect(plannedAfterLast(night(60), notice, moved, TZ)).toEqual(moved)
  })

  it("stops when the space is no longer due, even with a reminder still queued", () => {
    const planned = plannedAtQueue("first", notice, null, null, TZ)
    const queued = input({ due: false, steps: [step("first", notice, notice, planned), step("second", night(30), null, planned)], waiting: 1 })
    expect(decideProcedure(queued, night(31))).toEqual({ action: "reset" })
    expect(decideProcedure(input({ due: false, noticeAt: null }), night(31))).toEqual({ action: "none" })
  })

  it("treats a procedure started before the steps existed as a floor, for manual handling, never a restart", () => {
    const legacy = input({ noticeAt: notice, steps: [] })
    const d = decideProcedure(legacy, night(90))
    expect(d).toMatchObject({ action: "blocked", reason: "legacy", step: null })
    expect((d as { plannedAt: Date }).plannedAt.getTime()).toBeGreaterThanOrEqual(notice.getTime() + MIN_DEACTIVATION_DAYS * DAY)
    // Never deactivated, never sent a first email again, however late.
    expect(decideProcedure(legacy, night(400)).action).toBe("blocked")
    // A step missing in the middle is not trusted either.
    const planned = plannedAtQueue("first", notice, null, null, TZ)
    expect(decideProcedure(input({ steps: [step("first", notice, notice, planned), step("last", night(60), night(60), planned)] }), night(90))).toMatchObject({ action: "blocked", reason: "legacy" })
  })

  it("plans on day boundaries of the organisation's time zone, through daylight saving changes", () => {
    // 02:00 UTC is 04:00 in Zurich in summer, 03:00 in winter: the next local midnight.
    expect(ceilToLocalMidnight(new Date("2027-08-15T02:00:00Z"), TZ).toISOString()).toBe("2027-08-15T22:00:00.000Z")
    expect(ceilToLocalMidnight(new Date("2027-12-15T02:00:00Z"), TZ).toISOString()).toBe("2027-12-15T23:00:00.000Z")
    // Exactly midnight stays; New York's local day is still the 14th at 02:00 UTC.
    expect(ceilToLocalMidnight(new Date("2027-12-15T23:00:00Z"), TZ).toISOString()).toBe("2027-12-15T23:00:00.000Z")
    expect(ceilToLocalMidnight(new Date("2027-12-15T02:00:00Z"), "America/New_York").toISOString()).toBe("2027-12-15T05:00:00.000Z")
    // A procedure crossing the end of daylight saving: still 75 periods of 24 h at least.
    const autumn = new Date("2027-09-01T02:00:00Z")
    const p = plannedAtQueue("first", autumn, null, null, TZ)
    expect(p.toISOString()).toBe("2027-11-15T23:00:00.000Z")
    expect(p.getTime() - autumn.getTime()).toBeGreaterThanOrEqual(75 * DAY)
    // The keep link (valid until the planned date) works through the whole announced day.
    expect(deadlineDay(p).toLocaleDateString("fr-FR", { timeZone: TZ })).toBe("15/11/2027")
  })

  it("shows each step queued, sent or blocked, with the real planned date", () => {
    const planned = plannedAtQueue("first", notice, null, null, TZ)
    const p = input({ steps: [step("first", notice, night(0, 9), planned), step("second", night(30), null, planned)], plannedAt: planned, waiting: 1 })
    expect(procedureView(p, night(30, 60))).toMatchObject({
      steps: [{ step: "first", state: "sent", at: night(0, 9) }, { step: "second", state: "queued", at: night(30) }],
      blocked: null,
      plannedAt: planned,
    })
    expect(procedureView({ ...p, waiting: 0 }, night(31))).toMatchObject({
      steps: [{ state: "sent" }, { state: "blocked" }],
      blocked: { reason: "undelivered" },
    })
    const waitingNext = procedureView(input({ steps: [step("first", notice, night(0, 9), planned)], plannedAt: planned }), night(5))
    expect(waitingNext.next).toEqual({ label: "2e rappel", at: new Date("2027-07-01T00:00:00Z") })
  })
})

describe("inactivity copy checked right before the send (#1114)", () => {
  const org = { active: true, exempt: false, postponedUntil: null, lastActivityAt: new Date("2025-01-01T00:00:00Z"), lastRetentionConfirmedAt: null, adminEmails: ["Julie@Example.org"] }
  const copy = { recipientEmail: "julie@example.org", queuedAt: notice }

  it("goes to a current administrator while the procedure runs", () => {
    expect(inactivityCopyVerdict(copy, org, night(1))).toBeNull()
  })

  it("is cancelled for an administrator removed or whose address changed", () => {
    expect(inactivityCopyVerdict(copy, { ...org, adminEmails: [] }, night(1))).toMatch(/Plus organisateur/)
    expect(inactivityCopyVerdict(copy, { ...org, adminEmails: ["julie@new.example.org"] }, night(1))).toMatch(/Plus organisateur/)
  })

  it("is cancelled once the procedure stopped: activity, answer, exclusion, postponement", () => {
    expect(inactivityCopyVerdict(copy, { ...org, lastActivityAt: night(1) }, night(2))).toMatch(/arrêtée/)
    expect(inactivityCopyVerdict(copy, { ...org, lastRetentionConfirmedAt: night(1) }, night(2))).toMatch(/arrêtée/)
    expect(inactivityCopyVerdict(copy, { ...org, exempt: true }, night(2))).toMatch(/arrêtée/)
    expect(inactivityCopyVerdict(copy, { ...org, postponedUntil: night(100) }, night(2))).toMatch(/arrêtée/)
    // An old postponement, over before the step, does not stop it.
    expect(inactivityCopyVerdict(copy, { ...org, postponedUntil: night(-10) }, night(2))).toBeNull()
  })
})
