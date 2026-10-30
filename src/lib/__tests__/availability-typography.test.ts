// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import {
  availabilityOffConfirmText, closedNowSentence, contactLine, correctionDeadlineSentence, deadlineSentence, linkStateText, organiserDeadlineSentence,
  remindHintText, savedSentence, sendResultText, zoneLabel, AVAILABILITY_LINK_NOTICE, AVAILABILITY_OPTION_HINT, CORRECTION_NOTICE, CORRECTION_SAVED_TEXT,
  COLLECTION_CLOSED_ERROR, DEADLINE_PASSED_ERROR, LINK_NOT_FOUND_ERROR,
} from "../event-availability-text"
import { applySubmission, availabilitySubmissionSchema, checkAnswerSet, resolveDay, submissionIssue } from "../event-availability"
import { addRange, chooseDay, copiedText, editorFrom, editorSubmission } from "../availability-editor"
import { renderAvailabilityRequest } from "../notifications/templates/availability"

/**
 * French typography of the dated availability's words (#1146, independent review): a no-break space
 * before « : ; ? ! » and inside « », so that a colon never starts a line. The texts the modules
 * produce are checked by calling them; the screens' own words by reading every string, template
 * part and JSX text of their source.
 */

/** An ordinary space before « : ; ? ! » or inside « » (the rule of proposal-typography.test.ts). */
const ORDINARY_SPACE_BEFORE_PUNCTUATION = /[ \t\n][:;?!]|« | »/

const bad = (texts: readonly string[]) => texts.filter((t) => ORDINARY_SPACE_BEFORE_PUNCTUATION.test(t))

describe("no-break spaces in the dated availability's words", () => {
  it("covers the texts of the volunteer page, the organisers' page and the email", () => {
    const tz = "Europe/Zurich"
    const texts: string[] = [AVAILABILITY_LINK_NOTICE, AVAILABILITY_OPTION_HINT, CORRECTION_NOTICE, CORRECTION_SAVED_TEXT, COLLECTION_CLOSED_ERROR, DEADLINE_PASSED_ERROR, LINK_NOT_FOUND_ERROR]
    for (const open of [true, false]) texts.push(deadlineSentence("2099-07-01T21:59:00Z", open, tz)!, organiserDeadlineSentence("2099-07-01T21:59:00Z", open, tz))
    texts.push(organiserDeadlineSentence(null, true, tz), correctionDeadlineSentence(new Date("2099-07-12T22:00:00Z"), tz))
    for (const published of [true, false]) for (const lost of [true, false]) texts.push(closedNowSentence(published, lost))
    texts.push(contactLine("Les Amis", "a@example.org").lead, contactLine(null, null).lead, savedSentence(null, tz), savedSentence("2099-07-01T21:59:00Z", tz), zoneLabel(tz), zoneLabel("Europe/Paris"))
    texts.push(availabilityOffConfirmText(1), availabilityOffConfirmText(3))
    for (const reminder of [true, false]) {
      texts.push(sendResultText({ asked: 4, emailsQueued: 0, recentlySkipped: 3, withoutEmail: 1 }, reminder), sendResultText({ asked: 2, emailsQueued: 2, recentlySkipped: 0, withoutEmail: 0 }, reminder))
    }
    texts.push(remindHintText(0, 0), remindHintText(2, 3), remindHintText(1, 1))
    const when = () => "vendredi 30 octobre à 23h51"
    for (const [email, hasLink, sentAt, lastRemindedAt] of [[null, false, null, null], ["a@x.org", false, null, null], ["a@x.org", true, "x", null], ["a@x.org", true, "x", "y"], ["a@x.org", true, null, null]] as const) {
      for (const enabled of [true, false]) texts.push(linkStateText({ email, hasLink, sentAt, lastRemindedAt }, enabled, when))
    }
    const dates = ["2099-07-10", "2099-07-11"]
    for (const voice of ["tu", "vous"] as const) {
      const empty = editorSubmission(editorFrom(dates, []), voice)
      const missing = editorSubmission(addRange(chooseDay(editorFrom(dates, []), dates[0], "available"), dates[0]), voice)
      for (const r of [empty, missing]) if (!r.ok) texts.push(...r.errors.map((e) => e.message))
      const overlap = applySubmission([{ date: dates[0], ranges: [{ start: "20:00", end: "03:00" }] }, { date: dates[1], ranges: [{ start: "01:00", end: "05:00" }] }], [], dates, tz, voice)
      if (!overlap.ok) texts.push(overlap.error)
    }
    texts.push(copiedText({ date: dates[0], choice: "unavailable", ranges: [] }, dates[1]), copiedText({ date: dates[0], choice: "available", ranges: [{ key: 0, start: "8:00", end: "9:00" }] }, dates[1]))
    const day = resolveDay({ date: "2026-03-29", ranges: [{ start: "02:15", end: "05:00" }] }, tz)
    if (!day.ok) texts.push(day.error)
    const same = resolveDay({ date: dates[0], ranges: [{ start: "10:00", end: "10:00" }] }, tz)
    if (!same.ok) texts.push(same.error)
    const outside = checkAnswerSet([{ date: "2099-07-12", ranges: [] }], dates)
    if (!outside.ok) texts.push(outside.error)
    for (const body of [{ days: [] }, { days: [{ date: dates[0], ranges: [{ start: "8h", end: "9:00" }] }] }, null]) {
      const r = availabilitySubmissionSchema.safeParse(body)
      if (!r.success) texts.push(submissionIssue(r.error, body).error)
    }
    for (const reminder of [true, false]) {
      const mail = renderAvailabilityRequest({ kind: "availability_request", recipient: { email: "a@example.org", name: "Léa" }, organizationId: "o", data: { firstName: "Léa", organizationName: "Les Amis", eventTitle: "Fête", datesLabel: "le samedi 4 juillet", deadlineLabel: reminder ? null : "dimanche 28 juin à 23h59", orgSlug: "amis", token: "t", reminder } })
      texts.push(mail.subject, mail.text)
    }
    expect(texts.length).toBeGreaterThan(50)
    expect(bad(texts)).toEqual([])
    // The guard itself: an ordinary space is caught.
    expect(bad(["Lien : x", "« Pas disponible »", "a ; b", "Prêt ?"])).toHaveLength(4)
  })

  it("covers the words written in the screens themselves", () => {
    const files = [
      "src/components/AvailabilityEditor.tsx",
      "src/app/disponibilites/[token]/page.tsx",
      "src/components/admin/AvailabilityManager.tsx",
      "src/components/admin/EventAvailabilityOption.tsx",
      "src/lib/notifications/templates/availability.ts",
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
