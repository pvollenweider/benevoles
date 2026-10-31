// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { INPUT_PART_WORDS, staleSentence, type InputPart } from "../proposal-config"
import { assignmentSentence, gapSentence, personSentence, stateLabel, stateSentence, type GapReport } from "../proposal-explanations"
import { ANOTHER_HINT, anotherReplaceRecap, LEASE_EXPIRED_SENTENCE, NO_OTHER_SENTENCE, QUEUE_EXPIRED_SENTENCE, coverageDetails, coverageLine, droppedSentence, formToConfig, historyEntry, ONLY_ONE_SENTENCE, runLine, sameAsSentence, rotationSummary, runStateLabel, summaryProblems, TARGET_FIELD_ERROR, type PageShift, type ProposalForm } from "../proposal-view"

/**
 * French typography of the proposal's words (#1172 review): a no-break space (U+00A0 or U+202F)
 * before « : ; ? ! » and inside « », never an ordinary one, so that a colon never starts a line.
 * Every user-facing string the proposal's modules produce is checked here; the page's own text is
 * checked by rendering it (ProposalWorkspace.react.test.tsx).
 */
export const ORDINARY_SPACE_BEFORE_PUNCTUATION = /[ \t\n][:;?!]|« | »/

function badOnes(texts: readonly string[]): string[] {
  return texts.filter((t) => ORDINARY_SPACE_BEFORE_PUNCTUATION.test(t))
}

describe("no-break spaces in the proposal's words", () => {
  const shifts: PageShift[] = [{ id: "a", roleName: "Bar", date: "2031-07-07", capacity: 1, open: true }]
  const form = (extra: Partial<ProposalForm>): ProposalForm => ({
    dates: [], postes: [], people: [], posteChoices: [], maxConsecutiveDays: "0", maxNightAddOns: "x", ...extra,
  })

  it("covers states, sentences, problems, history, recaps and staleness", () => {
    const texts: string[] = []
    for (const status of ["queued", "running", "failed", "interrupted", "finished"]) for (const outcome of [null, "complete", "incomplete", "proven_impossible"]) texts.push(runStateLabel({ status, outcome }))
    for (const outcome of ["complete", "incomplete", "proven_impossible"] as const) for (const execution of ["finished", "interrupted"] as const) for (const stopReason of ["budget", "cancelled"] as const) {
      texts.push(stateLabel({ outcome, execution }), stateSentence({ outcome, execution, stopReason }))
    }
    const gap: GapReport = { shiftId: "s", missing: 2, missingCritical: 1, reserveMissing: 1, eligible: 3, excluded: { reserved: 2, no_answer: 1 }, blocked: { overlap: 1, role_limit: 1, workload: 1, addable: 1 }, workloadRules: { daily: 1 }, proven: true }
    texts.push(gapSentence(gap), gapSentence({ ...gap, eligible: 0, excluded: { no_answer: 2 } }))
    for (const seat of ["reserve", "critical", "need"] as const) texts.push(assignmentSentence({ shiftId: "s", volunteerId: "v", seat, plannedMinutes: 480, targetMinutes: 720, otherCategoryThanDayBefore: true, preferred: true, avoided: true }))
    texts.push(personSentence({ volunteerId: "v", targetMinutes: 360, plannedMinutes: 360, generatedMinutes: 360, generated: 1, gapMinutes: 0, categories: [], nightAddOns: 0 }))
    texts.push(personSentence({ volunteerId: "v", targetMinutes: 0, plannedMinutes: 60, generatedMinutes: 60, generated: 1, gapMinutes: 60, categories: [], nightAddOns: 0 }))
    const r = formToConfig(form({ people: [{ volunteerId: "p", included: true, targetHours: "", prefer: "Bar", avoid: "Bar" }, { volunteerId: "q", included: true, targetHours: "", prefer: "", avoid: "" }, { volunteerId: "z", included: true, targetHours: "x", prefer: "", avoid: "" }], posteChoices: [{ roleName: "Bar", category: "x".repeat(81), night: false, reserve: 9 }] }), shifts, (id) => `Personne ${id}`)
    if (r.ok) throw new Error("expected problems")
    texts.push(...r.problems.map((p) => p.message), ...summaryProblems(r.problems).map((p) => p.message), TARGET_FIELD_ERROR)
    const coverage = { seats: 31, filled: 29, criticalSeats: 20, criticalFilled: 19, reserveSeats: 2, reserveFilled: 1 }
    texts.push(coverageLine(coverage), ...coverageDetails(coverage))
    texts.push(historyEntry({ ordinal: 3, status: "finished", outcome: "proven_impossible", writtenAt: new Date(), writtenCount: 29, coverage }, "30 octobre à 23:22"))
    texts.push(runStateLabel({ status: "finished", outcome: null, stopReason: "no_other" }), NO_OTHER_SENTENCE)
    texts.push(runStateLabel({ status: "interrupted", outcome: null, stopReason: "queue_expired" }), LEASE_EXPIRED_SENTENCE, QUEUE_EXPIRED_SENTENCE)
    texts.push(runLine(3, "30 octobre à 23:22"), ANOTHER_HINT, ONLY_ONE_SENTENCE, sameAsSentence(2))
    for (const n of [1, 2]) { const r = anotherReplaceRecap(n, 3); texts.push(r.title, r.lead, ...r.lines, r.confirmLabel) }
    texts.push(rotationSummary([{ roleName: "Bar", category: "Bars", night: true, reserve: 1 }], "2", "2"))
    texts.push(droppedSentence([{ reason: "availability" }, { reason: "zzz" }])!)
    texts.push(staleSentence(Object.keys(INPUT_PART_WORDS) as InputPart[])!)
    expect(texts.length).toBeGreaterThan(40)
    expect(badOnes(texts)).toEqual([])
    // The guard itself: an ordinary space is caught, a no-break one is not.
    expect(badOnes(["Couverture : x", "« Proposé »", "a ; b", "Prêt ?"])).toHaveLength(4)
    expect(badOnes(["Couverture : x", "« Proposé »", "a ; b", "Prêt ?"])).toEqual([])
  })
})
