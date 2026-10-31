// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import { ackLabel, committedHoursText, fitDetail, shiftFit, shiftInterval, AVAILABILITY_ACK_REQUIRED, FIT_GROUP_LABELS, FIT_LABELS, SPREAD_SORT_EXPLANATION, type AckAction, type AnswerForFit } from "../availability-assist"
import { blockingMarker, draftShiftTerms, judgeDraftBatch, publicationRefusalText, DRAFTS_CHANGED_TEXT, PROBLEM_MARKERS, PUBLICATION_KEY_REUSED_TEXT, type BatchPerson, type BatchShift, type DraftProblemCode } from "../draft-assignments"
import { availabilityWords, buildBoard, type BoardPerson, type BoardShift } from "../draft-board"
import { reviewReasonTexts } from "../event-availability-text"
import { localDateTimeToUtc } from "../time-zone"

/**
 * French typography of assisted assignment and draft assignments (#1146, independent review): a
 * no-break space before « : ; ? ! » and inside « », so that a colon never starts a line. The texts
 * the modules produce are checked by calling them; the screens' own words by reading every string,
 * template part and JSX text of their source (the rule of availability-typography.test.ts).
 */

const ORDINARY_SPACE_BEFORE_PUNCTUATION = /[ \t\n][:;?!]|« | »/
const bad = (texts: readonly string[]) => texts.filter((t) => ORDINARY_SPACE_BEFORE_PUNCTUATION.test(t))

const TZ = "Europe/Zurich"
const DATES = ["2031-07-10", "2031-07-11"]
const shift = (id: string, extra: Partial<BoardShift> = {}): BoardShift => ({
  id, eventId: "e", roleName: "Bar", label: "Soir", date: new Date("2031-07-11T00:00:00Z"), startTime: "10:00", endTime: "14:00", status: "open",
  capacity: 1, occupied: 1, overlapAllowed: false, assignedOnly: false, minAge: 18, reservedTags: [], locationDetails: null, latitude: null, longitude: null,
  mealOnTheGo: false, placeId: null, placeName: null, ...extra,
})
const answer: AnswerForFit = {
  requestId: "r", revision: 2,
  days: [{ date: "2031-07-10", ranges: [] }, { date: "2031-07-11", ranges: [{ startTime: "12:00", endTime: "13:00", startsAt: localDateTimeToUtc(new Date("2031-07-11T00:00:00Z"), "12:00", TZ), endsAt: localDateTimeToUtc(new Date("2031-07-11T00:00:00Z"), "13:00", TZ) }] }],
}
const person = (id: string, extra: Partial<BoardPerson> = {}): BoardPerson => ({
  id, firstName: "Aline", lastName: "Martin", email: null, organizationId: "org", active: true, erasedAt: null, mergedIntoId: null, birthDate: null, tags: [],
  held: [], answer, sameNameHint: null, reviewReason: "published,merge", ...extra,
})

describe("no-break spaces in the assignment screens' words", () => {
  it("covers the texts the modules produce", () => {
    const texts: string[] = [AVAILABILITY_ACK_REQUIRED, SPREAD_SORT_EXPLANATION, DRAFTS_CHANGED_TEXT, PUBLICATION_KEY_REUSED_TEXT, ...Object.values(FIT_LABELS), ...Object.values(FIT_GROUP_LABELS)]
    for (const a of ["Ajouter", "Accepter", "Rétablir", "Valider", "Garder"] as AckAction[]) texts.push(ackLabel("Aline", a), ackLabel("Lucas", a))
    for (const code of Object.keys(PROBLEM_MARKERS) as DraftProblemCode[]) texts.push(blockingMarker(code))
    texts.push(committedHoursText({ confirmed: 120, pending: 60, draft: 60, committed: 180, sameDay: 0 }), committedHoursText({ confirmed: 0, pending: 0, draft: 0, committed: 0, sameDay: 0 }))
    texts.push(fitDetail(shiftFit(shiftInterval({ id: "s", date: new Date("2031-07-11T00:00:00Z"), startTime: "10:00", endTime: "14:00" }, TZ), answer, DATES, TZ)))
    texts.push(availabilityWords(answer, "2031-07-11").text, ...reviewReasonTexts("published,merge,other"))

    // Every refusal of a batch: gone, cancelled, ended, changed, age, reserved, overlap, capacity, limit, acknowledgement.
    const s = (id: string, extra: Partial<BatchShift> = {}) => shift(id, extra) as BatchShift
    const shifts = new Map<string, BatchShift>([
      ["a", s("a")], ["b", s("b", { status: "cancelled" })], ["c", s("c", { date: new Date("2020-01-01T00:00:00Z") })], ["d", s("d", { minAge: null, roleName: "Loge", startTime: "11:00", endTime: "15:00" })],
      ["e", s("e", { minAge: null, roleName: "Caisse", startTime: "20:00", endTime: "22:00", capacity: 5, occupied: 0 })],
    ])
    const people = new Map<string, BatchPerson>([["p", person("p")], ["q", person("q", { active: false })], ["k", person("k", { birthDate: new Date("2020-01-01"), tags: [] })]])
    const draft = (id: string, shiftId: string, volunteerId: string, stamp = "none") => ({ id, shiftId, volunteerId, shiftTerms: draftShiftTerms(shifts.get(shiftId)!), availabilityStamp: stamp, ackKey: null })
    const verdict = judgeDraftBatch({
      eventId: "e", organizationId: "org", timeZone: TZ, availability: { timeZone: TZ, dates: DATES }, now: new Date("2031-07-01T00:00:00Z"),
      drafts: [draft("1", "a", "p"), draft("2", "b", "p"), draft("3", "c", "p"), draft("4", "d", "k", "a2:r:x"), draft("5", "e", "k", "r:2"), draft("6", "a", "q"), draft("7", "a", "k", "r:2"), { ...draft("8", "e", "p", "r:2"), shiftTerms: "old" }],
      shifts, people, reserved: new Map([["Caisse", ["Trésorerie"]]]), limits: new Map([["Bar", 0]]),
    })
    texts.push(...verdict.problems.flatMap((p) => [p.message, p.short ?? ""]), publicationRefusalText(verdict.problems))
    expect(verdict.problems.length).toBeGreaterThan(5)

    const board = buildBoard({
      eventId: "e", organizationId: "org", timeZone: TZ, availability: { timeZone: TZ, dates: DATES }, now: new Date("2031-07-01T00:00:00Z"), gate: { kind: "off" },
      shifts: new Map([["a", shift("a")]]), people: [person("p", { held: [{ id: "r1", status: "active", shift: shift("a") }] })], drafts: [], reserved: new Map(), limits: new Map(),
    })
    for (const r of board.rows) for (const c of r.cells) for (const i of c.items) texts.push(i.review ?? "", i.fitLabel ?? "", i.fitDetail)
    expect(board.summary.toReview).toHaveLength(1)

    expect(texts.length).toBeGreaterThan(40)
    expect(bad(texts)).toEqual([])
    expect(bad(["Lien : x", "« Pas disponible »", "a ; b", "Prêt ?"])).toHaveLength(4)
  })

  it("covers the words written in the screens themselves", () => {
    const files = [
      "src/lib/draft-board.ts",
      "src/lib/draft-assignments.ts",
      "src/lib/draft-assignments-server.ts",
      "src/lib/availability-assist.ts",
      "src/lib/french-elision.ts",
      "src/components/admin/DraftBoard.tsx",
      "src/components/admin/ShiftAssistPanel.tsx",
      "src/components/admin/registrations/ManualAddForm.tsx",
      "src/components/admin/AvailabilityAck.tsx",
      "src/app/admin/events/[id]/availability/assign/page.tsx",
      "src/app/admin/events/[id]/availability/drafts/page.tsx",
    ]
    const found: string[] = []
    for (const file of files) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8")
      const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      const K = ts.SyntaxKind
      const visit = (n: ts.Node) => {
        if ([K.StringLiteral, K.NoSubstitutionTemplateLiteral, K.TemplateHead, K.TemplateMiddle, K.TemplateTail, K.JsxText].includes(n.kind)) {
          const text = n.getText(sf)
          if (ORDINARY_SPACE_BEFORE_PUNCTUATION.test(text)) found.push(`${file}: ${text.trim().slice(0, 60)}`)
        }
        ts.forEachChild(n, visit)
      }
      visit(sf)
    }
    expect(found).toEqual([])
  })
})
