// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { AnswerForFit } from "../../availability-assist"
import { DEFAULT_PROPOSAL_BUDGET, PROPOSAL_INPUT_VERSION, suggestedTargetMinutes, type ProposalBudget, type ProposalInput, type ProposalPerson, type ProposalShift } from "../../proposal-input"
import { localDateTimeToUtc } from "../../time-zone"
import { activePolicy, buildPolicy, type WorkloadPolicyValues } from "../../workload-policy"

/**
 * A representative, anonymised festival planning for the assignment proposal (#1172): the shape of
 * the owner's pilot (a transversal team of about 36 people over 4 set-up days, 6 festival days and
 * a teardown day; truck crews with a driver seat, a production desk around the clock, cable crews
 * per stage, street concerts, a standby reserve, night add-ons), with invented people, stages and
 * dates. Nothing here comes from the real festival or its people.
 */

export const TZ = "Europe/Zurich"
export const SETUP_DATES = ["2031-07-03", "2031-07-04", "2031-07-05", "2031-07-06"]
export const FESTIVAL_DATES = ["2031-07-07", "2031-07-08", "2031-07-09", "2031-07-10", "2031-07-11", "2031-07-12"]
export const TEARDOWN_DATES = ["2031-07-13"]
export const ALL_DATES = [...SETUP_DATES, ...FESTIVAL_DATES, ...TEARDOWN_DATES]

/** The owner's pilot policy: the existing repères of #1171 (2026-10-30). */
export const PILOT_POLICY_VALUES: WorkloadPolicyValues = {
  serviceDayStart: "06:00",
  maxContinuousMinutes: 6 * 60,
  minBreakMinutes: 20,
  maxDailyMinutes: 10 * 60,
  maxEventMinutes: 48 * 60,
  minRestMinutes: 11 * 60,
  maxIdleGapMinutes: 3 * 60,
  offDay: { apply: true, minOffDays: 1, windowDays: 7 },
  meal: { apply: true, minutes: 30, windows: [{ start: "11:30", end: "14:00" }, { start: "18:00", end: "21:00" }], days: "all" },
  travel: { apply: true, minutes: 15 },
  minors: { apply: false },
}

export const pilotPolicy = (values: WorkloadPolicyValues = PILOT_POLICY_VALUES) =>
  activePolicy(buildPolicy(values, TZ), { startDate: ALL_DATES[0], endDate: ALL_DATES[ALL_DATES.length - 1] })

// Common French, Swiss and other surnames; invented pairings.
const NAMES = [
  "Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent",
  "Müller", "Meier", "Schmid", "Keller", "Weber", "Huber", "Schneider", "Meyer", "Steiner", "Fischer", "Gerber", "Brunner",
  "Rossi", "Ferrari", "Silva", "Santos", "Nguyen", "Haddad", "Kovač", "Novak", "Yilmaz", "Popescu", "García", "Fernandes",
]

const pid = (i: number) => `p${String(i + 1).padStart(2, "0")}`

type ShiftSpec = Omit<ProposalShift, "held" | "inScope" | "reserve" | "category" | "night" | "mealOnTheGo" | "placeId" | "placeName" | "minVolunteers" | "overlapAllowed" | "minAge" | "reservedTags" | "maxPerVolunteer"> &
  Partial<Pick<ProposalShift, "held" | "reserve" | "category" | "night" | "mealOnTheGo" | "placeId" | "placeName" | "minVolunteers" | "minAge" | "reservedTags" | "maxPerVolunteer">>

const PLACES: Record<string, string> = { lac: "Scène du Lac", chap: "Chapiteau", pins: "Scène des Pins", club: "Club", depot: "Dépôt", prod: "Bureau de production" }

function shift(spec: ShiftSpec): ProposalShift {
  const placeId = spec.placeId ?? null
  return {
    held: 0, reserve: 0, category: null, night: false, mealOnTheGo: false, minVolunteers: null, overlapAllowed: false, minAge: null, reservedTags: [], maxPerVolunteer: null,
    ...spec, placeId, placeName: placeId ? PLACES[placeId] : null, inScope: true,
  }
}

/** Every shift of the pilot. `date` codes keep ids readable: « f1-camion1-jour ». */
export function pilotShifts(): ProposalShift[] {
  const out: ProposalShift[] = []
  SETUP_DATES.forEach((date, i) => {
    const d = `s${i + 1}`
    out.push(shift({ id: `${d}-montage-matin`, roleName: "Montage", date, startTime: "08:00", endTime: "12:00", capacity: 5, minVolunteers: 3, category: "montage", placeId: "lac" }))
    out.push(shift({ id: `${d}-montage-aprem`, roleName: "Montage", date, startTime: "13:00", endTime: "17:00", capacity: 5, minVolunteers: 3, category: "montage", placeId: "lac" }))
    out.push(shift({ id: `${d}-materiel`, roleName: "Matériel", date, startTime: "09:00", endTime: "15:00", capacity: 4, minVolunteers: 2, category: "materiel", placeId: "depot", mealOnTheGo: true }))
  })
  FESTIVAL_DATES.forEach((date, i) => {
    const d = `f${i + 1}`
    for (const [slot, start, end] of [["nuit", "02:00", "08:00"], ["matin", "08:00", "14:00"], ["aprem", "14:00", "20:00"], ["soir", "20:00", "02:00"]] as const) {
      out.push(shift({ id: `${d}-prod-${slot}`, roleName: "Production", date, startTime: start, endTime: end, capacity: 1, category: "production", placeId: "prod", mealOnTheGo: true }))
    }
    out.push(shift({ id: `${d}-camion1-jour`, roleName: "Camion 1", date, startTime: "09:00", endTime: "15:00", capacity: 3, minVolunteers: 2, held: 1, category: "camion", placeId: "depot", mealOnTheGo: true }))
    out.push(shift({ id: `${d}-camion2-jour`, roleName: "Camion 2", date, startTime: "09:00", endTime: "15:00", capacity: 2, minVolunteers: 1, category: "camion", placeId: "depot", mealOnTheGo: true }))
    out.push(shift({ id: `${d}-chauffeur-jour`, roleName: "Chauffeur camion 2", date, startTime: "09:00", endTime: "15:00", capacity: 1, category: "camion", placeId: "depot", mealOnTheGo: true, reservedTags: ["Permis"], minAge: 18 }))
    out.push(shift({ id: `${d}-camion1-soir`, roleName: "Camion 1", date, startTime: "17:00", endTime: "23:00", capacity: 2, minVolunteers: 1, category: "camion", placeId: "depot", mealOnTheGo: true }))
    out.push(shift({ id: `${d}-camion2-soir`, roleName: "Camion 2", date, startTime: "17:00", endTime: "23:00", capacity: 2, minVolunteers: 1, category: "camion", placeId: "depot", mealOnTheGo: true }))
    out.push(shift({ id: `${d}-chauffeur-soir`, roleName: "Chauffeur camion 2", date, startTime: "17:00", endTime: "23:00", capacity: 1, category: "camion", placeId: "depot", mealOnTheGo: true, reservedTags: ["Permis"], minAge: 18 }))
    for (const stage of ["lac", "chap", "pins"]) {
      out.push(shift({ id: `${d}-cable-${stage}`, roleName: `Câblage ${PLACES[stage]}`, date, startTime: "18:00", endTime: "00:00", capacity: 1, category: "cablage", placeId: stage, mealOnTheGo: true }))
    }
    out.push(shift({ id: `${d}-sauvages`, roleName: "Concerts sauvages", date, startTime: "15:30", endTime: "21:30", capacity: 2, minVolunteers: 1, category: "sauvages", placeId: "club", mealOnTheGo: true }))
    out.push(shift({ id: `${d}-renfort`, roleName: "Renfort disponible sur place", date, startTime: "12:00", endTime: "18:00", capacity: 2, minVolunteers: 1, reserve: 1, category: "renfort", placeId: "prod", mealOnTheGo: true }))
    out.push(shift({ id: `${d}-nuit-lac`, roleName: "Nuit Scène du Lac", date, startTime: "23:30", endTime: "02:30", capacity: 2, minVolunteers: 1, category: "nuit", night: true, placeId: "lac" }))
  })
  TEARDOWN_DATES.forEach((date) => {
    out.push(shift({ id: "t1-demontage-matin", roleName: "Démontage", date, startTime: "07:00", endTime: "12:00", capacity: 6, minVolunteers: 4, category: "demontage", placeId: "lac" }))
    out.push(shift({ id: "t1-demontage-aprem", roleName: "Démontage", date, startTime: "13:00", endTime: "18:00", capacity: 6, minVolunteers: 4, category: "demontage", placeId: "lac" }))
    out.push(shift({ id: "t1-demontage-nuit", roleName: "Démontage de nuit", date, startTime: "22:00", endTime: "04:00", capacity: 4, minVolunteers: 2, category: "demontage", night: true, placeId: "chap" }))
  })
  return out
}

/** A free range on a date, with its real instants (an end before the start is the next morning). */
function range(date: string, startTime: string, endTime: string) {
  const base = new Date(`${date}T00:00:00Z`)
  const startsAt = localDateTimeToUtc(base, startTime, TZ)
  const [h, m] = endTime.split(":").map(Number)
  const endMinutes = h * 60 + m + (endTime <= startTime ? 24 * 60 : 0)
  const endsAt = localDateTimeToUtc(base, `${Math.floor(endMinutes / 60)}:${String(endMinutes % 60).padStart(2, "0")}`, TZ)
  return { startTime, endTime, startsAt, endsAt }
}

/** The availability profile of person i: deterministic, varied like a real team's answers. */
export function pilotAnswer(i: number): AnswerForFit | null {
  if (i === 33 || i === 34 || i === 35) return null // never answered (D02)
  const days = ALL_DATES.map((date, di) => {
    const setup = di < SETUP_DATES.length
    if (setup && i % 9 === 4 && di < 2) return { date, ranges: [] } // absent on the first set-up days
    if (!setup && i % 11 === 7 && di === 6) return { date, ranges: [] } // one festival day away
    if (!setup && i % 6 === 5) return { date, ranges: [range(date, "14:00", "06:00")] } // evenings and nights only
    if (!setup && i % 10 === 3) return { date, ranges: [range(date, "07:00", "23:30")] } // daytime only
    return { date, ranges: [range(date, "06:00", "06:00")] }
  })
  return { requestId: `req-${pid(i)}`, revision: 1, days }
}

/** The pilot team: 36 people, 7 with a driving licence tag, one of them without a known birth date. */
export function pilotPeople(count = 36): ProposalPerson[] {
  const cap = PILOT_POLICY_VALUES.maxEventMinutes
  return Array.from({ length: count }, (_, i) => {
    const answer = pilotAnswer(i)
    const permis = i % 5 === 1
    const person: ProposalPerson = {
      id: pid(i),
      birthDate: permis && i === 26 ? null : `${1965 + (i % 35)}-0${1 + (i % 9)}-1${i % 9}`,
      tags: permis ? ["Permis"] : [],
      answer,
      fixedShiftIds: [],
      liveShiftIds: [],
      personal: null,
      targetMinutes: suggestedTargetMinutes(answer, FESTIVAL_DATES, cap),
      prefer: [],
      avoid: [],
      inScope: true,
    }
    return person
  })
}

export const pilotName = (id: string) => NAMES[Number(id.slice(1)) - 1] ?? id

/** The whole pilot input: the fixed lead of truck 1 on every festival day shift (a locked assignment), a few organiser choices. */
export function pilotInput(opts: { seed?: number; budget?: ProposalBudget; people?: number } = {}): ProposalInput {
  const shifts = pilotShifts()
  const people = pilotPeople(opts.people ?? 36)
  const lead = people[0]
  lead.fixedShiftIds = FESTIVAL_DATES.map((_, i) => `f${i + 1}-camion1-jour`)
  lead.liveShiftIds = [...lead.fixedShiftIds]
  // C04: two people who asked for fewer hours, one without a target.
  if (people[8]) people[8].targetMinutes = 12 * 60
  if (people[9]) people[9].targetMinutes = 18 * 60
  if (people[10]) people[10].targetMinutes = 0
  // Organiser preferences (level 5), one of them on a seat the person cannot take (C05: no « Permis »).
  if (people[4]) people[4].prefer = ["Production"]
  if (people[5]) people[5].avoid = ["Nuit Scène du Lac"]
  if (people[2]) people[2].prefer = ["Chauffeur camion 2"]
  return {
    version: PROPOSAL_INPUT_VERSION,
    eventId: "evt-pilot",
    now: "2031-06-20T08:00:00.000Z",
    timeZone: TZ,
    availability: { timeZone: TZ, dates: ALL_DATES },
    policy: pilotPolicy(),
    rotation: { maxConsecutiveDays: 2, maxNightAddOns: 2 },
    seed: opts.seed ?? 1172,
    budget: opts.budget ?? DEFAULT_PROPOSAL_BUDGET,
    shifts,
    people,
  }
}
