// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { shiftFit, shiftInterval } from "../../../src/lib/availability-assist"
import { answersEditable, correctionUntil, newlyOutside, CORRECTION_NOTICE, CORRECTION_SAVED_TEXT } from "../../../src/lib/availability-correction"
import { BETA_CAPABILITIES } from "../../../src/lib/beta-capabilities"
import { isLateWithdrawal, selfCancelState, shiftStartsAt } from "../../../src/lib/cancel-deadline"
import { availabilityDates } from "../../../src/lib/event-availability"
import { renderWithdrawalAdminNotice } from "../../../src/lib/notifications/templates/administration"
import { renderAvailabilityRequest } from "../../../src/lib/notifications/templates/availability"
import { renderRegistrationAddedByOrganizer } from "../../../src/lib/notifications/templates/registration"
import type { NotificationPayload } from "../../../src/lib/notifications/types"
import { AVAILABILITY_LINK_LABEL } from "../../../src/lib/event-availability-text"
import { addDays } from "../../../src/lib/shift-series"
import { planVolunteerWithdraw, withdrawCopy, WITHDRAWAL_MESSAGE_LABEL, WITHDRAWAL_MESSAGE_MAX } from "../../../src/lib/volunteer-withdraw"
import { activePolicy, buildPolicy, evaluateWorkload, type DutyShift } from "../../../src/lib/workload-policy"
import { fullNameOf } from "../fixture-names"
import { PB_EXPECTED, PB_TYPED, PUBLICATION_OWNER_EMAIL } from "../record-assignment-publication"
import { PR_PEOPLE, PR_POLICY_VALUES, PR_POSTES, PR_TIME_ZONE, resolvedAnswer } from "../../../scripts/seed-video-proposals"
import { PB_BETA_OPEN, PB_EVENT, PB_ORG, PB_OWNER, PB_PERSON_EMAIL, PB_PLAN, pbEmail, pbPersonId, pbShiftId } from "../../../scripts/seed-video-publication"
import { fridayAfter } from "../../../scripts/seed-video-workload"

/**
 * The ASSIGNMENT_PUBLICATION take judged before it is filmed: the seeded drafts
 * (scripts/seed-video-publication.ts), the emails the product renders for the people the take
 * follows, what Noah may still do with a published mission (cancel, the organisers told), and
 * Emma's correction after the publication. Every sentence the narration or the take reads
 * (PB_EXPECTED) is checked against the product's own words. The continuity with
 * ASSIGNMENT_PROPOSALS (PB_PLAN is that take's result) is checked in proposals-fixture.test.ts.
 */

const root = path.resolve(__dirname, "../../..")
/** The product types non-breaking spaces before « : » and « ; »; the screens read them as spaces (Playwright too). */
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ")
const plainMail = (mail: { subject: string; text: string; html: string }) => ({ subject: plain(mail.subject), text: plain(mail.text), html: plain(mail.html) })
const recorder = readFileSync(path.join(root, "videos/lib/record-assignment-publication.ts"), "utf8")
const seed = readFileSync(path.join(root, "scripts/seed-video-publication.ts"), "utf8")
const board = plain(readFileSync(path.join(root, "src/components/admin/DraftBoard.tsx"), "utf8"))
const boardText = plain(readFileSync(path.join(root, "src/lib/draft-board.ts"), "utf8"))
const myPage = plain(readFileSync(path.join(root, "src/app/my/[token]/page.tsx"), "utf8"))
/** Delays read from their modules' source (they load the database client, never imported by a unit test). */
const source = (file: string) => readFileSync(path.join(root, file), "utf8")

const TODAY = "2026-10-31"
const FIRST_DAY = fridayAfter(TODAY, 14)
const DATES = availabilityDates(new Date(FIRST_DAY), new Date(addDays(FIRST_DAY, 2)))
const shifts = PR_POSTES.flatMap((p) => p.shifts.map((s) => ({ ...s, poste: p })))
const shiftOf = (key: string) => {
  const s = shifts.find((x) => x.key === key)
  if (!s) throw new Error(`no shift ${key}`)
  return { id: pbShiftId(key), roleName: s.poste.roleName, label: s.poste.roleName, date: addDays(FIRST_DAY, s.day), startTime: s.start, endTime: s.end, poste: s.poste }
}
const answerOf = (key: string) => ({ requestId: `request-${key}`, revision: 1, days: resolvedAnswer(PR_PEOPLE[key], FIRST_DAY) })
const payload = (kind: string, data: Record<string, unknown>): NotificationPayload => ({ kind, recipient: { email: "x@example.org", name: "x" }, data } as unknown as NotificationPayload)
/** The placement email of a person, as the product renders it at delivery (shifts read in time order). */
function placementEmail(key: string) {
  const mine = PB_PLAN[key].map(shiftOf).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
  return plainMail(renderRegistrationAddedByOrganizer(payload("registration_added_by_organizer", {
    volunteerName: fullNameOf(PR_PEOPLE[key].firstName), eventTitle: PB_EVENT.title, orgSlug: PB_ORG.slug, organizationName: PB_ORG.name,
    organizerName: fullNameOf(PB_OWNER.firstName), shifts: mine.map((s) => ({ roleName: s.roleName, label: s.label, date: s.date, startTime: s.startTime, endTime: s.endTime })), editToken: "token",
  })))
}

describe("assignment publication video fixture (scripts/seed-video-publication.ts)", () => {
  test("only the capabilities the take needs are open, each one shipped; no proposal, no swap", () => {
    expect([...PB_BETA_OPEN].sort()).toEqual(["availability", "workloadProtection"])
    for (const id of PB_BETA_OPEN) expect(BETA_CAPABILITIES[id].shipped).toBe(true)
    expect(seed).toContain("const value = { open: PB_BETA_OPEN }")
    expect(seed).toContain("shiftSwapsDefault: false")
  })

  test("29 drafts for 11 people, Jules none, every one inside the person's answer, no shift over capacity", () => {
    const all = Object.entries(PB_PLAN).flatMap(([k, list]) => list.map((s) => ({ k, s })))
    expect(all).toHaveLength(29)
    expect(Object.keys(PB_PLAN)).toHaveLength(11)
    expect(PB_PLAN).not.toHaveProperty("jules")
    expect(`${all.length} affectations en brouillon pour ${Object.keys(PB_PLAN).length} personnes.`).toBe(PB_EXPECTED.drafts)
    for (const { k, s } of all) expect(shiftFit(shiftInterval(shiftOf(s), PR_TIME_ZONE), answerOf(k), DATES, PR_TIME_ZONE).state, `${k} ${s}`).toBe("full")
    for (const s of shifts) expect(all.filter((d) => d.s === s.key).length, s.key).toBeLessThanOrEqual(s.capacity)
  })

  test("every programme respects the event's protection: the publication goes through", () => {
    const policy = activePolicy(buildPolicy(PR_POLICY_VALUES, PR_TIME_ZONE), { startDate: FIRST_DAY, endDate: addDays(FIRST_DAY, 2) })
    for (const [k, list] of Object.entries(PB_PLAN)) {
      const duty: DutyShift[] = list.map((key) => {
        const s = shiftOf(key)
        return { id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, mealOnTheGo: s.poste.mealOnTheGo, placeId: s.poste.place, placeName: s.poste.place }
      })
      expect(evaluateWorkload(duty, policy).map((f) => f.rule), k).toEqual([])
    }
  })

  test("the confirmation and « Publication faite » say what the take reads", () => {
    expect(board).toContain('title: "Publier les affectations ?"')
    expect(board).toContain('pour ${plural(summary.people, "personne", "personnes")} : chaque personne avec une adresse email reçoit un seul email avec ses missions.`')
    expect("29 affectations pour 11 personnes : chaque personne avec une adresse email reçoit un seul email avec ses missions.").toMatch(PB_EXPECTED.confirm)
    expect("Les places sont prises maintenant ; tout est publié d'un coup, ou rien si un point bloque.").toMatch(PB_EXPECTED.confirmTakes)
    expect(board).toContain('confirmLabel: "Publier"')
    expect(board).toContain('{plural(published.count, "affectation publiée", "affectations publiées")} pour {plural(published.people, "personne", "personnes")}. Chaque personne avec une adresse email reçoit un seul email avec ses missions.')
    expect(PB_EXPECTED.published).toBe("29 affectations publiées pour 11 personnes. Chaque personne avec une adresse email reçoit un seul email avec ses missions.")
    expect(board).toContain(PB_EXPECTED.noDraft)
    expect(board).toContain(">Voir les inscriptions<")
  })

  test("the placement emails: one per person, every mission, the button and the way to cancel; about ten minutes later", () => {
    expect(source("src/lib/notifications/added-by-organizer.ts")).toContain("export const ADDED_BY_ORGANIZER_DELAY_MS = 10 * 60 * 1000")
    const emma = placementEmail(PB_TYPED.emma.key)
    expect(emma.subject).toBe(PB_EXPECTED.emailSubject)
    expect(emma.text).toContain(`Hello ${PB_TYPED.emma.firstName},`)
    expect(emma.text).toContain(PB_EXPECTED.emailLead(PB_TYPED.emma.firstName, 2))
    expect(emma.text.split("\n").filter((l) => l.startsWith("- Bar des Tilleuls, "))).toHaveLength(2)
    expect(emma.html).toContain(PB_EXPECTED.emailButton)
    expect(emma.text).toContain(PB_EXPECTED.emailUnwanted)
    const noah = placementEmail(PB_TYPED.noah.key)
    const lines = noah.text.split("\n").filter((l) => l.startsWith("- "))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^- Accueil, samedi /)
    expect(lines[1]).toMatch(/^- Parking, dimanche /)
    expect(noah.text).toContain(PB_EXPECTED.emailLead(PB_TYPED.noah.firstName, 2))
    expect([...PB_TYPED.emma.shifts]).toEqual(PB_PLAN.emma)
    expect([...PB_TYPED.noah.shifts]).toEqual(PB_PLAN.noah)
  })

  test("Noah may cancel his car park himself, with a word for the organisation; the organisers are told a few minutes later", () => {
    const copy = withdrawCopy("active", "Parking")
    expect(copy.button).toBe(PB_EXPECTED.cancel)
    expect(copy.ariaLabel).toBe("Annuler le créneau Parking")
    expect(copy.confirmTitle).toBe(PB_EXPECTED.cancelTitle)
    expect(copy.confirmButton).toBe(PB_EXPECTED.cancelConfirm)
    expect(WITHDRAWAL_MESSAGE_LABEL).toBe(PB_EXPECTED.cancelMessage)
    expect(PB_TYPED.message.length).toBeLessThanOrEqual(WITHDRAWAL_MESSAGE_MAX)
    expect(planVolunteerWithdraw("active")).toEqual({ releasesSpot: true, notifiesOrganizers: true })
    // No earlier deadline on the event: until the shift starts; two weeks ahead, never a late withdrawal.
    const parking = shiftOf(PB_TYPED.noah.cancelled)
    const now = new Date(`${TODAY}T15:00:00Z`)
    expect(selfCancelState({ status: "active", shift: parking, setting: null, timeZone: PR_TIME_ZONE, now })).toEqual({ allowed: true, deadline: null })
    expect(isLateWithdrawal(shiftStartsAt(parking, PR_TIME_ZONE), now)).toBe(false)
    expect(source("src/lib/withdrawal-notifications.ts")).toContain("export const WITHDRAWAL_DIGEST_DELAY_MS = 5 * 60 * 1000")
    expect(myPage).toContain(">Tous mes créneaux<")
  })

  test("the organiser's withdrawal email: who, which shift, the word left, the place missing, « Trouver un remplaçant »", () => {
    const mail = plainMail(renderWithdrawalAdminNotice(payload("registration_cancelled", {
      eventId: PB_EVENT.id, eventTitle: PB_EVENT.title, volunteerName: fullNameOf("Noah"), shiftId: pbShiftId("par-sun"), shiftLabel: "Parking", roleName: "Parking",
      shiftDate: "22/11/2026", startTime: "10:00", endTime: "13:00", placesMissing: 1, waitlistTookSpot: false, message: PB_TYPED.message,
    })))
    expect(mail.subject).toBe(PB_EXPECTED.withdrawalSubject)
    expect(mail.text).toContain(`${fullNameOf("Noah")} se désiste de Parking`)
    expect(mail.text).toContain(PB_EXPECTED.placeMissing)
    expect(mail.text).toContain(PB_TYPED.message)
    expect(mail.html).toContain(PB_EXPECTED.replacement)
    expect(mail.text).toContain("Pour trouver quelqu'un : les membres libres à cet horaire")
  })

  test("Emma's availability email, then her correction after the publication: allowed, cancels nothing, flags her mission", () => {
    const request = plainMail(renderAvailabilityRequest(payload("availability_request", {
      firstName: "Emma", eventTitle: PB_EVENT.title, organizationName: PB_ORG.name, datesLabel: "du vendredi au dimanche", deadlineLabel: null, orgSlug: PB_ORG.slug, token: "token",
    })))
    expect(request.subject).toBe(PB_EXPECTED.availabilitySubject)
    expect(request.text).toContain("Bonjour Emma,")
    expect(AVAILABILITY_LINK_LABEL).toBe(PB_EXPECTED.availabilityButton)
    // No deadline: open, and the page says a correction cancels nothing since she holds a published mission.
    const until = correctionUntil(shifts.map((s) => ({ date: addDays(FIRST_DAY, s.day), startTime: s.start, endTime: s.end, status: "open" })), PR_TIME_ZONE)
    expect(answersEditable({ deadline: null, published: true, until, now: new Date(`${TODAY}T15:00:00Z`) })).toMatchObject({ open: true, published: true })
    expect(plain(CORRECTION_NOTICE)).toBe(PB_EXPECTED.correction)
    expect(plain(CORRECTION_SAVED_TEXT)).toBe(PB_EXPECTED.saved)
    // Friday « Pas disponible »: only her Friday at the bar falls outside.
    const before = answerOf("emma")
    const after = { ...before, revision: 2, days: before.days.map((d, i) => (i === PB_TYPED.emma.day ? { ...d, ranges: [] } : d)) }
    const missions = PB_PLAN.emma.map((k) => ({ ...shiftOf(k), name: shiftOf(k).roleName }))
    expect(newlyOutside(missions, before, after, DATES, PR_TIME_ZONE).map((m) => m.id)).toEqual([pbShiftId(PB_TYPED.emma.corrected)])
    expect(source("src/lib/availability-change-notifications.ts")).toContain("export const AVAILABILITY_CHANGE_DIGEST_DELAY_MS = 10 * 60 * 1000")
  })

  test("the organiser's « mission à revoir » words", () => {
    expect(board).toContain('"1 mission à revoir"} après une correction des disponibilités')
    expect(PB_EXPECTED.toReview).toBe("1 mission à revoir après une correction des disponibilités")
    expect(board).toContain("Ces missions sont actuellement en dehors des disponibilités corrigées. Personne n&apos;a été déplacé ni désinscrit.")
    expect(PB_EXPECTED.toReviewNote).toBe("Ces missions sont actuellement en dehors des disponibilités corrigées. Personne n'a été déplacé ni désinscrit.")
    expect(boardText).toContain(PB_EXPECTED.cellReview)
  })

  test("the recorder signs in, opens and follows what the seed created", () => {
    expect(PUBLICATION_OWNER_EMAIL).toBe(PB_OWNER.email)
    expect(recorder).toContain(`const EVENT_ID = "${PB_EVENT.id}"`)
    expect(recorder).toContain(`const ORG_ID = "${PB_ORG.id}"`)
    expect(recorder).toContain("const person = (key: string) => `video-publication-person-${key}`")
    expect(pbPersonId("emma")).toBe("video-publication-person-emma")
    for (const k of [PB_TYPED.emma, PB_TYPED.noah]) expect(PR_PEOPLE[k.key].firstName).toBe(k.firstName)
    expect(PB_PLAN.noah).toContain(PB_TYPED.noah.cancelled)
    expect(PB_PLAN.noah).toContain(PB_TYPED.noah.kept)
    expect(PB_PLAN.emma).toContain(PB_TYPED.emma.corrected)
  })

  test("people are cast members on example.org, never « Exemple », and never the demo nor the proposals organisation", () => {
    for (const k of Object.keys(PR_PEOPLE)) expect(pbEmail(k)).toMatch(PB_PERSON_EMAIL)
    expect(PB_OWNER.email).toMatch(PB_PERSON_EMAIL)
    expect(seed).not.toMatch(/Exemple/)
    expect(seed).toContain("surnameOf(person.firstName)")
    expect(seed).not.toMatch(/organizationId: "default"|id: "default"/)
    expect(PB_ORG.id).not.toBe("video-proposals")
  })
})
