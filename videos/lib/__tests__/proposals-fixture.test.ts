// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { BETA_CAPABILITIES } from "../../../src/lib/beta-capabilities"
import { availabilityDates } from "../../../src/lib/event-availability"
import { assignmentSentence, buildReport, gapSentence, personSentence, stateLabel } from "../../../src/lib/proposal-explanations"
import { DEFAULT_PROPOSAL_BUDGET, PROPOSAL_INPUT_VERSION, suggestedTargetMinutes, type ProposalInput } from "../../../src/lib/proposal-input"
import { validateAssignments } from "../../../src/lib/proposal-proofs"
import { ProposalSearch } from "../../../src/lib/proposal-solver"
import { formatHours, formToConfig, posteChoicesFrom, scopeShiftIds, type PersonChoice } from "../../../src/lib/proposal-view"
import { addDays } from "../../../src/lib/shift-series"
import { activePolicy, buildPolicy, checkPolicyValues, evaluateWorkload, parseWorkloadPolicy, WRITE_SECTIONS, type DutyShift } from "../../../src/lib/workload-policy"
import { AP_EXPECTED, AP_TYPED, PROPOSALS_OWNER_EMAIL } from "../record-assignment-proposals"
import {
  PR_BETA_OPEN, PR_EVENT, PR_OWNER, PR_PEOPLE, PR_PERSON_EMAIL, PR_POLICY_VALUES, PR_POSTES, PR_TIME_ZONE, prPersonId, prShiftId, resolvedAnswer,
} from "../../../scripts/seed-video-proposals"
import { fridayAfter } from "../../../scripts/seed-video-workload"

/**
 * The ASSIGNMENT_PROPOSALS take judged before it is filmed: the seeded event
 * (scripts/seed-video-proposals.ts) with the choices the recorder makes (AP_TYPED), turned into a
 * configuration by the page's own code (formToConfig), then into the input the server builds
 * (src/lib/proposal-runs-data.ts, mirrored here without a database) and solved by the product's
 * search with the default budget. Every line the narration reads (AP_EXPECTED) is checked against
 * the result, so a change of the solver, the rules or the fixture fails here, not mid-take.
 */

const root = path.resolve(__dirname, "../../..")
const recorder = readFileSync(path.join(root, "videos/lib/record-assignment-proposals.ts"), "utf8")
const seed = readFileSync(path.join(root, "scripts/seed-video-proposals.ts"), "utf8")

const TODAY = "2026-10-30"
const shifts = PR_POSTES.flatMap((p) => p.shifts.map((s) => ({ ...s, poste: p })))
const placeOf = (name: string) => `video-proposals-place-${name}`

/** The page's data, the form the take fills and the run's input, as the server would build them. */
function takeInput(today: string) {
  const firstDay = fridayAfter(today, 14)
  const dates = availabilityDates(new Date(firstDay), new Date(addDays(firstDay, 2)))
  const pageShifts = shifts.map((s) => ({ id: prShiftId(s.key), roleName: s.poste.roleName, date: addDays(firstDay, s.day), capacity: s.capacity, open: true }))
  const answers = new Map(Object.entries(PR_PEOPLE).map(([k, p]) => [k, p.answer ? { requestId: `request-${k}`, revision: 1, days: resolvedAnswer(p, firstDay) } : null]))
  const policy = activePolicy(buildPolicy(PR_POLICY_VALUES, PR_TIME_ZONE), { startDate: firstDay, endDate: addDays(firstDay, 2) })
  const suggestion = (k: string) => suggestedTargetMinutes(answers.get(k) ?? null, dates, policy.maxEventMinutes)
  // The page includes who answered; « Appliquer la suggestion » fills every included target; then the take's edits.
  const people: PersonChoice[] = Object.entries(PR_PEOPLE).map(([k, p]) => ({
    volunteerId: prPersonId(k), included: !!p.answer, targetHours: formatHours(suggestion(k)),
    prefer: k === AP_TYPED.prefer.key ? AP_TYPED.prefer.poste : "", avoid: k === AP_TYPED.avoid.key ? AP_TYPED.avoid.poste : "",
  }))
  people.find((p) => p.volunteerId === prPersonId(AP_TYPED.target.key))!.targetHours = AP_TYPED.target.hours
  const postes = PR_POSTES.map((p) => p.roleName)
  const form = formToConfig({ dates, postes, people, posteChoices: posteChoicesFrom(null, pageShifts, postes), maxConsecutiveDays: "", maxNightAddOns: "", seed: AP_TYPED.seed }, pageShifts)
  if (!form.ok) throw new Error(JSON.stringify(form.problems))
  const { config, targets } = form
  const scope = new Set(config.scope.shiftIds)
  const input: ProposalInput = {
    version: PROPOSAL_INPUT_VERSION, eventId: PR_EVENT.id, now: `${today}T12:00:00.000Z`, timeZone: PR_TIME_ZONE,
    availability: { timeZone: PR_TIME_ZONE, dates }, policy, rotation: config.rotation, seed: config.seed,
    budget: { evaluations: DEFAULT_PROPOSAL_BUDGET.evaluations, stagnation: DEFAULT_PROPOSAL_BUDGET.stagnation },
    shifts: shifts.map((s) => ({
      id: prShiftId(s.key), roleName: s.poste.roleName, date: addDays(firstDay, s.day), startTime: s.start, endTime: s.end, capacity: s.capacity, minVolunteers: null,
      held: 0, overlapAllowed: false, minAge: null, reservedTags: [], maxPerVolunteer: null, mealOnTheGo: s.poste.mealOnTheGo, placeId: placeOf(s.poste.place), placeName: s.poste.place,
      category: null, night: false, reserve: 0, inScope: scope.has(prShiftId(s.key)),
    })).sort((a, b) => (a.id < b.id ? -1 : 1)),
    people: config.scope.volunteerIds.map((id) => {
      const k = id.replace("video-proposals-person-", "")
      const wish = config.preferences.find((p) => p.volunteerId === id)
      return {
        id, birthDate: null, tags: [], answer: answers.get(k) ?? null, fixedShiftIds: [], liveShiftIds: [], personal: null,
        targetMinutes: targets.find((t) => t.volunteerId === id)!.targetMinutes, prefer: wish?.prefer ?? [], avoid: wish?.avoid ?? [], inScope: true,
      }
    }),
  }
  return { firstDay, dates, pageShifts, config, input, policy }
}

/** The run as the server computes it (src/lib/proposal-runs-server.ts executeRun): search, then report. */
function solve(today: string) {
  const take = takeInput(today)
  const search = new ProposalSearch(take.input)
  while (!search.step(10)) { /* the whole budget, slice after slice, as the server does */ }
  const best = search.best()
  const report = buildReport(search.model, { assignments: best.assignments, score: best.score, execution: "finished", stopReason: search.stopReason ?? "budget" })
  return { ...take, assignments: best.assignments, report }
}

const RESULT = solve(TODAY)
const key = (id: string) => id.replace(/^video-proposals-(person|shift)-/, "")
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`
const minutesOf = (s: { start: string; end: string }) => {
  const [a, b] = [s.start, s.end].map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)))
  return (b <= a ? b + 24 * 60 : b) - a
}
/** The proposed shifts of a person (keys). */
const proposedTo = (person: string) => RESULT.assignments.filter((a) => key(a.volunteerId) === person).map((a) => key(a.shiftId))
/** One person's drafts after the take's manual change (Léa's Friday ticket office goes to Lou), as the evaluator reads them. */
function programmeAfterTake(person: string): DutyShift[] {
  let mine = proposedTo(person)
  if (person === AP_TYPED.removed.key) mine = mine.filter((k) => k !== "bil-fri")
  if (person === AP_TYPED.added.key) mine = [...mine, "bil-fri"]
  return mine.map((k) => {
    const s = shifts.find((x) => x.key === k)!
    return { id: prShiftId(k), date: addDays(RESULT.firstDay, s.day), startTime: s.start, endTime: s.end, mealOnTheGo: s.poste.mealOnTheGo, placeId: placeOf(s.poste.place), placeName: s.poste.place }
  })
}

describe("assignment proposals video fixture (scripts/seed-video-proposals.ts)", () => {
  test("the event runs Friday to Sunday, at least two weeks ahead, whatever the take's day", () => {
    for (const today of ["2026-10-30", "2026-11-01", "2026-12-26", "2027-03-12"]) {
      const friday = fridayAfter(today, 14)
      expect(new Date(`${friday}T00:00:00Z`).getUTCDay()).toBe(5)
      expect((Date.parse(friday) - Date.parse(today)) / 86_400_000).toBeGreaterThanOrEqual(14)
    }
  })

  test("the protection is complete and on, as the page requires", () => {
    expect(checkPolicyValues(PR_POLICY_VALUES, WRITE_SECTIONS).ok).toBe(true)
    expect(parseWorkloadPolicy(buildPolicy(PR_POLICY_VALUES, PR_TIME_ZONE)).ok).toBe(true)
  })

  test("only the capabilities the page needs are open, each one shipped", () => {
    expect([...PR_BETA_OPEN].sort()).toEqual(["assignmentProposals", "availability", "workloadProtection"])
    for (const id of PR_BETA_OPEN) expect(BETA_CAPABILITIES[id].shipped).toBe(true)
    expect(seed).toContain("const value = { open: PR_BETA_OPEN }")
  })

  test("Jules is asked and has not answered; the eleven others answered and are included", () => {
    const answered = Object.entries(PR_PEOPLE).filter(([, p]) => p.answer).map(([k]) => k)
    expect(answered).toHaveLength(11)
    expect(PR_PEOPLE[AP_TYPED.unanswered.key].answer).toBeNull()
    expect(RESULT.config.scope.volunteerIds).toEqual(answered.map(prPersonId).sort())
  })

  test("the scope line reads « 14 créneaux, 31 places à pourvoir »", () => {
    const ids = scopeShiftIds(RESULT.pageShifts, RESULT.dates, PR_POSTES.map((p) => p.roleName))
    const seats = shifts.reduce((n, s) => n + s.capacity, 0)
    expect(`${plural(ids.length, "créneau", "créneaux")}, ${plural(seats, "place à pourvoir", "places à pourvoir")}`).toBe(AP_EXPECTED.countLine)
    expect(PR_POSTES).toHaveLength(5)
  })

  test("the suggestion gives Noah 12 h (two free dates) before the take types 6", () => {
    const noah = RESULT.input.people.find((p) => p.id === prPersonId(AP_TYPED.target.key))!
    expect(suggestedTargetMinutes(noah.answer, RESULT.dates, RESULT.policy.maxEventMinutes)).toBe(12 * 60)
    expect(noah.targetMinutes).toBe(Number(AP_TYPED.target.hours) * 60)
  })

  test("the result: « Impossible démontré », 29 seats of 31, every one written", () => {
    expect(stateLabel(RESULT.report)).toBe(AP_EXPECTED.state)
    const { coverage } = RESULT.report
    expect(`${coverage.filled} places couvertes sur ${coverage.seats}`).toBe(AP_EXPECTED.covered)
    // Every assignment passes the independent check: the write keeps them all.
    expect(validateAssignments(RESULT.input, RESULT.assignments)).toEqual([])
    expect(`${plural(RESULT.assignments.length, "affectation écrite", "affectations écrites")} dans les brouillons.`).toBe(AP_EXPECTED.written)
  })

  test("the only empty seats are the two of « Rangement du Kiosque », for want of availability", () => {
    expect(RESULT.report.gaps).toHaveLength(1)
    const [gap] = RESULT.report.gaps
    expect(key(gap.shiftId)).toBe("ran-sun")
    expect(shifts.find((s) => s.key === "ran-sun")!.poste.roleName).toBe(AP_EXPECTED.gapPoste)
    expect(gapSentence(gap)).toContain(AP_EXPECTED.gapReason)
    expect(gap.missing).toBe(2)
  })

  test("Noah reaches his own 6 h; most others stay a little under theirs, the team offering more hours than needed", () => {
    const noah = RESULT.report.people.find((p) => key(p.volunteerId) === AP_TYPED.target.key)!
    expect(personSentence(noah)).toBe(AP_EXPECTED.targetLoad)
    expect(RESULT.report.people.filter((p) => p.gapMinutes < 0).length).toBeGreaterThan(RESULT.report.people.length / 2)
    expect(RESULT.report.people.every((p) => p.generated > 0)).toBe(true)
    const offered = RESULT.input.people.reduce((n, p) => n + p.targetMinutes, 0)
    const needed = shifts.reduce((n, s) => n + s.capacity * minutesOf(s), 0)
    expect(offered).toBeGreaterThan(needed)
  })

  test("Emma is on the bar on Friday, her wished poste, with the sentence the take shows; Lucas is not on the car park", () => {
    const line = RESULT.report.assignments.find((a) => key(a.volunteerId) === AP_TYPED.prefer.key && key(a.shiftId) === "bar-fri")
    expect(line).toBeDefined()
    expect(assignmentSentence(line!)).toBe(AP_EXPECTED.wishSentence)
    expect(proposedTo(AP_TYPED.avoid.key).some((k) => k.startsWith("par-"))).toBe(false)
  })

  test("the drafts the take locks and removes exist; Lou is free and available for Friday's ticket office", () => {
    expect(proposedTo(AP_TYPED.locked.key)).toContain("bar-fri")
    expect(proposedTo(AP_TYPED.removed.key)).toContain("bil-fri")
    expect(proposedTo(AP_TYPED.added.key)).not.toContain("bil-fri")
    expect(proposedTo(AP_TYPED.added.key)).toContain("acc-fri-pm")
    // Lou answered for Friday from 13:00 to 20:00: the ticket office (17:00-20:00) is fully covered, no acknowledgement asked.
    expect(PR_PEOPLE[AP_TYPED.added.key].answer![0]).toEqual([{ start: "13:00", end: "20:00" }])
  })

  test("after the manual change every programme respects the limits, no shift is over capacity: publication stays possible", () => {
    for (const person of Object.keys(PR_PEOPLE)) expect(evaluateWorkload(programmeAfterTake(person), RESULT.policy).map((f) => f.rule), person).toEqual([])
    const drafts = Object.keys(PR_PEOPLE).flatMap((p) => programmeAfterTake(p).map(() => p))
    expect(`${plural(drafts.length, "affectation en brouillon", "affectations en brouillon")} pour ${plural(new Set(drafts).size, "personne", "personnes")}.`).toBe(AP_EXPECTED.drafts)
    for (const s of shifts) {
      const on = Object.keys(PR_PEOPLE).filter((p) => programmeAfterTake(p).some((d) => d.id === prShiftId(s.key))).length
      expect(on, s.key).toBeLessThanOrEqual(s.capacity)
    }
  })

  test("the same seed gives the same proposal whatever the take's day, clock changes included", () => {
    const shape = (today: string) => solve(today).assignments.map((a) => `${key(a.shiftId)}:${key(a.volunteerId)}`).sort()
    const reference = shape(TODAY)
    // 2026-10-09: the event ends on the Sunday clocks go back; 2027-03-12: the Sunday they go forward.
    for (const today of ["2026-10-09", "2027-03-12", "2026-12-20"]) expect(shape(today), today).toEqual(reference)
  })

  test("the recorder signs in, opens and types what the seed created", () => {
    expect(PROPOSALS_OWNER_EMAIL).toBe(PR_OWNER.email)
    expect(recorder).toContain(`const EVENT_ID = "${PR_EVENT.id}"`)
    expect(recorder).toContain("const person = (key: string) => `video-proposals-person-${key}`")
    for (const k of [AP_TYPED.target, AP_TYPED.prefer, AP_TYPED.avoid, AP_TYPED.locked, AP_TYPED.removed, AP_TYPED.added, AP_TYPED.unanswered]) expect(PR_PEOPLE[k.key].firstName).toBe(k.firstName)
    for (const k of [AP_TYPED.prefer, AP_TYPED.avoid, AP_TYPED.locked, AP_TYPED.removed, AP_TYPED.added]) expect(PR_POSTES.map((p) => p.roleName)).toContain(k.poste)
  })

  test("people are cast members on example.org, never « Exemple », and never the demo organisation", () => {
    for (const k of Object.keys(PR_PEOPLE)) expect(`video.proposals.${k}@example.org`).toMatch(PR_PERSON_EMAIL)
    expect(PR_OWNER.email).toMatch(PR_PERSON_EMAIL)
    expect(seed).not.toMatch(/Exemple/)
    expect(seed).toContain("surnameOf(person.firstName)")
    expect(seed).not.toMatch(/organizationId: "default"|id: "default"/)
  })
})
